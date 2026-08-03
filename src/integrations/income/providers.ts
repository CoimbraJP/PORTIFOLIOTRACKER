import type { AssetClassSlug, InstrumentKind } from '@/core/types/portfolio'
import { fetchJson, type InstrumentRef } from '@/integrations/providers/types'

/** Um provento anunciado, como chega do provedor. */
export interface IncomeEvent {
  instrumentId: string
  type: 'DIVIDEND' | 'JCP' | 'INCOME'
  /** Data-com, em `YYYY-MM-DD`. */
  exDate: string
  paymentDate: string | null
  /** Valor bruto por cota, como texto. */
  valuePerShare: string
  currency: string
  provider: string
  raw: unknown
}

export interface IncomeRun {
  provider: string
  events: IncomeEvent[]
  /** Símbolos que o provedor não soube responder. */
  missing: string[]
  error?: string
}

export interface IncomeProvider {
  readonly name: string
  isAvailable(): boolean
  supports(instrument: InstrumentRef): boolean
  fetchEvents(instruments: InstrumentRef[], since: string): Promise<IncomeRun>
}

/* -------------------------------------------------------------------------- *
 * BRAPI — ações e FIIs da B3
 * -------------------------------------------------------------------------- */

const STOCKS_DIVIDENDS = 'https://brapi.dev/api/v2/stocks/dividends'
const FII_DIVIDENDS = 'https://brapi.dev/api/v2/fii/dividends'

const STOCK_CLASSES = new Set<AssetClassSlug>(['acoes-br', 'etfs'])
const STOCK_KINDS = new Set<InstrumentKind>(['STOCK', 'ETF'])

/**
 * O rótulo da B3 traduzido para o tipo do ledger.
 *
 * A distinção entre dividendo e JCP não é cosmética: JCP tem 15% de IR retido
 * na fonte, e tratar os dois igual inflaria a renda passiva.
 */
function tipoPorLabel(label: string | null | undefined): IncomeEvent['type'] {
  const texto = (label ?? '').toUpperCase()

  if (texto.includes('JCP') || texto.includes('JUROS')) return 'JCP'
  // Rendimento de FII e amortização entram como INCOME: isentos, e o motor de
  // valoração já os trata como renda que não altera quantidade.
  if (texto.includes('RENDIMENTO') || texto.includes('AMORTIZA')) return 'INCOME'
  return 'DIVIDEND'
}

interface CashDividend {
  paymentDate?: string | null
  lastDatePrior?: string | null
  rate?: number | string | null
  label?: string | null
}

/** `2026-10-01T03:00:00.000Z` e `2025-12-01 00:00:00+00` viram `2026-10-01`. */
function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function toRate(value: unknown): string | null {
  const numero = typeof value === 'string' ? Number(value) : value
  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero <= 0) return null
  return String(numero)
}

/**
 * Proventos de ações, ETFs e FIIs da B3.
 *
 * Duas rotas, não uma: a BRAPI separa `/stocks/dividends` de `/fii/dividends`
 * porque a fonte e a semântica são diferentes — rendimento de FII vem do
 * informe mensal da CVM, dividendo de ação vem do fato relevante. Usar a rota
 * de ações para FII devolve vazio em silêncio.
 *
 * A rota de FII exige plano Pro. Sem ele, a chamada falha e os FIIs ficam sem
 * provento automático — o que a tela informa, em vez de fingir que não há.
 */
export class BrapiIncomeProvider implements IncomeProvider {
  readonly name = 'brapi'

  private get token(): string | undefined {
    return process.env.BRAPI_TOKEN?.trim() || undefined
  }

  isAvailable(): boolean {
    return this.token !== undefined
  }

  supports(instrument: InstrumentRef): boolean {
    if (instrument.classSlug === 'fiis' && instrument.kind === 'FII') return true
    return STOCK_CLASSES.has(instrument.classSlug) && STOCK_KINDS.has(instrument.kind)
  }

  async fetchEvents(instruments: InstrumentRef[], since: string): Promise<IncomeRun> {
    if (!this.isAvailable()) {
      return {
        provider: this.name,
        events: [],
        missing: instruments.map((i) => i.symbol),
        error: 'BRAPI_TOKEN não configurado',
      }
    }

    const fiis = instruments.filter((i) => i.classSlug === 'fiis')
    const acoes = instruments.filter((i) => i.classSlug !== 'fiis')

    const events: IncomeEvent[] = []
    const falhas: string[] = []
    const atendidos = new Set<string>()

    if (acoes.length > 0) {
      try {
        events.push(...(await this.buscarAcoes(acoes, since, atendidos)))
      } catch (error) {
        // Mesma lógica do bloco de FIIs abaixo: a BRAPI passou a exigir plano
        // pago para dividendo de AÇÃO também, não só de fundo. A mensagem crua
        // ("FEATURE_NOT_AVAILABLE") lida sozinha parece bug de configuração;
        // dizer que é restrição de plano poupa o usuário de procurar defeito
        // onde não tem.
        falhas.push(
          semPermissao(error)
            ? 'dividendos de ações exigem plano pago na BRAPI — o plano atual só cobre cotação'
            : `ações: ${mensagem(error)}`,
        )
      }
    }

    if (fiis.length > 0) {
      try {
        events.push(...(await this.buscarFiis(fiis, since, atendidos)))
      } catch (error) {
        // Falha aqui é esperada no plano gratuito. Não pode derrubar as ações,
        // que funcionam, nem virar exceção — vira aviso na tela.
        //
        // A mensagem crua da API diria "HTTP 403 — Você não tem permissão",
        // que soa como bug de configuração. Traduzir para o motivo real evita
        // que o usuário vá procurar defeito onde não tem.
        falhas.push(
          semPermissao(error)
            ? 'rendimentos de FII exigem plano Pro na BRAPI — o resto não é afetado'
            : `FIIs: ${mensagem(error)}`,
        )
      }
    }

    return {
      provider: this.name,
      events,
      missing: instruments.filter((i) => !atendidos.has(i.id)).map((i) => i.symbol),
      error: falhas.length > 0 ? falhas.join(' · ') : undefined,
    }
  }

  private async buscarAcoes(
    instruments: InstrumentRef[],
    since: string,
    atendidos: Set<string>,
  ): Promise<IncomeEvent[]> {
    const porSimbolo = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]))
    const events: IncomeEvent[] = []

    // Um por requisição: mesmo limite de plano que vale para cotação.
    for (const [chave, instrument] of porSimbolo) {
      const url = `${STOCKS_DIVIDENDS}?symbols=${chave}&startDate=${since}`
      const data = await fetchJson<{
        results?: {
          requestedSymbol?: string
          symbol?: string
          data?: { cashDividends?: CashDividend[] }
        }[]
        error?: boolean
        message?: string
      }>(url, { headers: { Authorization: `Bearer ${this.token}` }, timeoutMs: 15_000 })

      if (data.error) throw new Error(data.message ?? 'consulta recusada')

      for (const item of data.results ?? []) {
        const alvo = (item.requestedSymbol ?? item.symbol ?? '').toUpperCase()
        if (alvo !== chave) continue

        atendidos.add(instrument.id)
        events.push(...converter(item.data?.cashDividends ?? [], instrument, this.name))
      }

      await sleep(150)
    }

    return events
  }

  private async buscarFiis(
    instruments: InstrumentRef[],
    since: string,
    atendidos: Set<string>,
  ): Promise<IncomeEvent[]> {
    const porSimbolo = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]))

    // Aceita até 20 símbolos por requisição — esta rota não tem o limite de um
    // por chamada que a de cotação tem.
    const url = `${FII_DIVIDENDS}?symbols=${[...porSimbolo.keys()].join(',')}&startDate=${since}`
    const data = await fetchJson<{
      dividends?: (CashDividend & { symbol?: string })[]
      error?: boolean
      message?: string
    }>(url, { headers: { Authorization: `Bearer ${this.token}` }, timeoutMs: 20_000 })

    if (data.error) throw new Error(data.message ?? 'consulta recusada')

    const events: IncomeEvent[] = []

    for (const row of data.dividends ?? []) {
      const instrument = porSimbolo.get((row.symbol ?? '').toUpperCase())
      if (!instrument) continue

      atendidos.add(instrument.id)
      events.push(...converter([row], instrument, this.name))
    }

    return events
  }
}

/* -------------------------------------------------------------------------- *
 * Twelve Data — dividendos de stocks e ETFs internacionais
 * -------------------------------------------------------------------------- */

const TWELVE_DIVIDENDS = 'https://api.twelvedata.com/dividends'

const INTL_CLASSES = new Set<AssetClassSlug>(['stocks', 'etfs-int'])

/**
 * Dividendos americanos.
 *
 * Sem JCP e sem retenção: é figura do direito societário brasileiro. O imposto
 * americano sobre dividendo de não residente existe, mas depende de tratado e
 * de como a corretora reporta — modelar isso a partir da API seria chute.
 */
export class TwelveDataIncomeProvider implements IncomeProvider {
  readonly name = 'twelvedata'

  private get apiKey(): string | undefined {
    return process.env.TWELVEDATA_API_KEY?.trim() || undefined
  }

  isAvailable(): boolean {
    return this.apiKey !== undefined
  }

  supports(instrument: InstrumentRef): boolean {
    return INTL_CLASSES.has(instrument.classSlug) && instrument.kind !== 'FIXED_INCOME'
  }

  async fetchEvents(instruments: InstrumentRef[], since: string): Promise<IncomeRun> {
    if (!this.isAvailable()) {
      return {
        provider: this.name,
        events: [],
        missing: instruments.map((i) => i.symbol),
        error: 'TWELVEDATA_API_KEY não configurada',
      }
    }

    const events: IncomeEvent[] = []
    const atendidos = new Set<string>()
    const falhas: string[] = []
    // Plano sem acesso a `/dividends` rejeita TODO símbolo com o mesmo 403.
    // Sem isto, uma carteira com vinte stocks americanas vira vinte linhas
    // idênticas na tela — a mesma restrição contada vinte vezes.
    let semAcessoAoPlano = false

    for (const instrument of instruments) {
      const simbolo = instrument.externalIds.twelvedata ?? instrument.symbol

      try {
        const data = await fetchJson<{
          dividends?: { ex_date?: string; payment_date?: string | null; amount?: number | string }[]
          status?: string
          message?: string
        }>(
          `${TWELVE_DIVIDENDS}?symbol=${encodeURIComponent(simbolo)}` +
            `&start_date=${since}&apikey=${this.apiKey}`,
          { timeoutMs: 15_000 },
        )

        if (data.status === 'error') throw new Error(data.message ?? 'consulta recusada')

        atendidos.add(instrument.id)

        for (const row of data.dividends ?? []) {
          const exDate = toIsoDate(row.ex_date)
          const rate = toRate(row.amount)
          if (!exDate || !rate) continue

          events.push({
            instrumentId: instrument.id,
            type: 'DIVIDEND',
            exDate,
            paymentDate: toIsoDate(row.payment_date),
            valuePerShare: rate,
            currency: 'USD',
            provider: this.name,
            raw: row,
          })
        }
      } catch (error) {
        if (semPermissao(error)) {
          semAcessoAoPlano = true
        } else {
          falhas.push(`${instrument.symbol}: ${mensagem(error)}`)
        }
      }

      await sleep(150)
    }

    if (semAcessoAoPlano) {
      falhas.unshift('dividendos de ações internacionais exigem plano pago na Twelve Data')
    }

    return {
      provider: this.name,
      events,
      missing: instruments.filter((i) => !atendidos.has(i.id)).map((i) => i.symbol),
      error: falhas.length > 0 ? [...new Set(falhas)].join(' · ') : undefined,
    }
  }
}

/* -------------------------------------------------------------------------- *
 * Registry
 * -------------------------------------------------------------------------- */

const PROVIDERS: IncomeProvider[] = [new BrapiIncomeProvider(), new TwelveDataIncomeProvider()]

/** Instrumentos que alguma fonte sabe responder sobre proventos. */
export function hasIncomeProvider(instrument: InstrumentRef): boolean {
  return PROVIDERS.some((p) => p.supports(instrument))
}

export interface IncomeOutcome {
  events: IncomeEvent[]
  unresolved: string[]
  errors: { provider: string; message: string }[]
}

/**
 * Busca proventos em todas as fontes disponíveis.
 *
 * Mesma regra dos providers de cotação: falha de um não derruba os outros. Se a
 * rota de FII exigir plano pago, as ações continuam recebendo dividendo.
 */
export async function fetchIncomeEvents(
  instruments: InstrumentRef[],
  since: string,
): Promise<IncomeOutcome> {
  const outcome: IncomeOutcome = { events: [], unresolved: [], errors: [] }
  const pendentes = new Set(instruments.map((i) => i.symbol))

  const ativos = PROVIDERS.filter((p) => p.isAvailable())

  const runs = await Promise.all(
    ativos.map((provider) => {
      const meus = instruments.filter((i) => provider.supports(i))
      if (meus.length === 0) {
        return Promise.resolve<IncomeRun>({ provider: provider.name, events: [], missing: [] })
      }
      return provider.fetchEvents(meus, since)
    }),
  )

  for (const run of runs) {
    outcome.events.push(...run.events)
    if (run.error) outcome.errors.push({ provider: run.provider, message: run.error })
  }

  const resolvidos = new Set(outcome.events.map((e) => e.instrumentId))
  for (const instrument of instruments) {
    if (resolvidos.has(instrument.id)) pendentes.delete(instrument.symbol)
  }

  outcome.unresolved = [...pendentes]
  return outcome
}

function converter(
  rows: CashDividend[],
  instrument: InstrumentRef,
  provider: string,
): IncomeEvent[] {
  return rows.flatMap((row) => {
    const exDate = toIsoDate(row.lastDatePrior)
    const rate = toRate(row.rate)

    // Sem data-com não há como decidir quem tem direito, e sem valor não há
    // provento. Descartar é melhor do que inventar uma data.
    if (!exDate || !rate) return []

    return [
      {
        instrumentId: instrument.id,
        type: tipoPorLabel(row.label),
        exDate,
        paymentDate: toIsoDate(row.paymentDate),
        valuePerShare: rate,
        currency: 'BRL',
        provider,
        raw: row,
      },
    ]
  })
}

function mensagem(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido'
}

/** Recusa por plano, e não por defeito: 403, ou a palavra na resposta. */
function semPermissao(error: unknown): boolean {
  const texto = mensagem(error).toLowerCase()
  return texto.includes('403') || texto.includes('permissão') || texto.includes('forbidden')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
