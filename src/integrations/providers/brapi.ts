import type { AssetClassSlug, InstrumentKind } from '@/core/types/portfolio'
import {
  fetchJson,
  toPriceString,
  type InstrumentRef,
  type PriceProvider,
  type ProviderRun,
} from './types'

/**
 * Endpoint v2.
 *
 * O v1 (`/api/quote/{tickers}`) ainda responde, mas a BRAPI o trata como legado
 * e recomenda o v2 para integrações novas. FIIs e ETFs também passam por aqui —
 * só os *proventos* de FII têm rota própria (`/api/v2/fii/dividends`), o que
 * importa na fase de dividendos, não agora.
 */
const BASE = 'https://brapi.dev/api/v2/stocks/quote'

/** Classes negociadas na B3 que a BRAPI cobre. */
const B3_CLASSES = new Set<AssetClassSlug>(['acoes-br', 'fiis', 'etfs'])

/** Naturezas que se negociam em bolsa. Renda fixa e ativo customizado, não. */
const B3_KINDS = new Set<InstrumentKind>(['STOCK', 'FII', 'ETF'])

/**
 * Quantos tickers cabem numa requisição.
 *
 * O plano gratuito aceita **um só**; Startup aceita 10 e Pro, 20. Mandar mais
 * do que o plano permite devolve `QUOTES_PER_REQUEST_EXCEEDED` e nenhuma
 * cotação — por isso o valor é configurável em vez de fixo.
 */
function maxPerRequest(): number {
  const raw = Number(process.env.BRAPI_MAX_PER_REQUEST)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
}

/** Orçamento de chamadas por sincronização, retentativas incluídas. */
const REQUEST_BUDGET = 40

/**
 * Envelope do v2: cada item traz o ticker no topo e os dados de mercado dentro
 * de `data`. Ler `regularMarketPrice` na raiz devolve `undefined` — foi
 * exatamente esse aninhamento que fazia o preço chegar vazio no banco.
 */
interface BrapiItem {
  /** O que pedimos. Difere de `symbol` quando o papel foi renomeado. */
  requestedSymbol?: string
  symbol?: string
  data?: {
    currency?: string
    regularMarketPrice?: number | string | null
    regularMarketTime?: string
    logourl?: string | null
    logo?: string | null
  }
}

interface BrapiResponse {
  results?: BrapiItem[]
  error?: boolean | string
  message?: string
}

/**
 * Ações, FIIs e ETFs da B3.
 *
 * Opcional de propósito: sem `BRAPI_TOKEN` o provider se declara indisponível e
 * some do registry. Os ativos brasileiros continuam com preço manual e a tela
 * avisa — ninguém vê erro, e ligar depois é só colocar a variável no ambiente.
 */
export class BrapiProvider implements PriceProvider {
  readonly name = 'brapi'

  private get token(): string | undefined {
    return process.env.BRAPI_TOKEN?.trim() || undefined
  }

  isAvailable(): boolean {
    return this.token !== undefined
  }

  /**
   * Classe **e** natureza precisam concordar.
   *
   * Só a classe não basta: um CDB arquivado numa carteira de ações passaria e
   * iria para a API de bolsa, que devolveria "não encontrado". Exigir os dois
   * faz um ativo mal arquivado sair silenciosamente da fila em vez de virar
   * erro na tela do usuário.
   */
  supports(instrument: InstrumentRef): boolean {
    return B3_CLASSES.has(instrument.classSlug) && B3_KINDS.has(instrument.kind)
  }

  async fetchQuotes(instruments: InstrumentRef[]): Promise<ProviderRun> {
    if (!this.isAvailable()) {
      return {
        provider: this.name,
        quotes: [],
        missing: instruments.map((i) => i.symbol),
        error: 'BRAPI_TOKEN não configurado',
      }
    }

    const bySymbol = new Map(instruments.map((i) => [i.symbol.toUpperCase(), i]))
    const symbols = [...bySymbol.keys()]
    const lotes = chunk(symbols, maxPerRequest())

    const quotes: ProviderRun['quotes'] = []
    const seen = new Set<string>()
    /** Erro → tickers afetados. Saber *qual* papel falhou é o que permite agir. */
    const falhas = new Map<string, string[]>()
    let orcamento = REQUEST_BUDGET
    let cortados = 0

    for (const [index, lote] of lotes.entries()) {
      if (orcamento <= 0) {
        cortados += lote.length
        continue
      }

      // Sequencial, não paralelo: com um ticker por requisição, disparar seis
      // ao mesmo tempo é exatamente o padrão que dispara limite de taxa.
      if (index > 0) await sleep(120)

      try {
        orcamento -= 1
        const data = await this.consultar(lote, () => {
          orcamento -= 1
          return orcamento >= 0
        })

        for (const item of data.results ?? []) {
          // `requestedSymbol` primeiro: se o papel foi renomeado, é por ele que
          // encontramos o instrumento que pedimos.
          const chave = (item.requestedSymbol ?? item.symbol ?? '').toUpperCase()
          const instrument = bySymbol.get(chave)
          if (!instrument) continue

          const price = toPriceString(item.data?.regularMarketPrice)
          // Sem preço válido o ticker fica em `missing` e a tela avisa — melhor
          // do que gravar lixo, que zeraria a posição no dashboard.
          if (!price) continue

          seen.add(chave)
          quotes.push({
            instrumentId: instrument.id,
            price,
            currency: item.data?.currency ?? 'BRL',
            asOf: item.data?.regularMarketTime ? new Date(item.data.regularMarketTime) : new Date(),
            // O nome do campo varia entre tickers; aceitar os dois evita perder
            // o logo por causa de um alias.
            logoUrl: item.data?.logourl ?? item.data?.logo ?? null,
          })
        }
      } catch (error) {
        // Um lote que falha não derruba os outros: com um ticker por
        // requisição, um papel suspenso não pode zerar a sincronização inteira.
        const motivo = error instanceof Error ? error.message : 'erro desconhecido'
        falhas.set(motivo, [...(falhas.get(motivo) ?? []), ...lote])
      }
    }

    return {
      provider: this.name,
      quotes,
      missing: symbols.filter((symbol) => !seen.has(symbol)),
      error: resumirFalhas(falhas, cortados),
    }
  }

  /**
   * Uma consulta, com uma retentativa em erro 5xx.
   *
   * HTTP 500 é falha do servidor deles, não da nossa requisição: repetir uma
   * vez costuma resolver. Erro 4xx não é repetido — token inválido ou limite de
   * plano não melhora com insistência, só queima cota.
   */
  private async consultar(
    lote: string[],
    gastarRetentativa: () => boolean,
  ): Promise<BrapiResponse> {
    const url = `${BASE}?symbols=${lote.join(',')}`
    const options = { headers: { Authorization: `Bearer ${this.token}` } }

    try {
      return await this.consultarUmaVez(url, options)
    } catch (error) {
      const transitorio = error instanceof Error && /HTTP 5\d\d/.test(error.message)
      if (!transitorio || !gastarRetentativa()) throw error

      await sleep(600)
      return this.consultarUmaVez(url, options)
    }
  }

  private async consultarUmaVez(
    url: string,
    options: { headers: Record<string, string> },
  ): Promise<BrapiResponse> {
    const data = await fetchJson<BrapiResponse>(url, options)
    // A BRAPI às vezes responde 200 com `error: true` no corpo.
    if (data.error) throw new Error(data.message ?? 'A BRAPI recusou a consulta')
    return data
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Uma linha por causa, com os tickers afetados.
 *
 * Repetir "HTTP 500" seis vezes não informa mais do que uma. Mas dizer *quais*
 * papéis falharam informa muito: se for sempre o mesmo, o problema é o ticker;
 * se for todos, é a API.
 */
function resumirFalhas(falhas: Map<string, string[]>, cortados: number): string | undefined {
  const partes = [...falhas].map(([motivo, tickers]) => `${motivo} (${tickers.join(', ')})`)

  if (cortados > 0) {
    partes.push(`${cortados} ativo(s) ficaram de fora: orçamento de ${REQUEST_BUDGET} requisições`)
  }

  return partes.length > 0 ? partes.join(' · ') : undefined
}
