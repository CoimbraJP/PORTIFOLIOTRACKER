import type { AssetClassSlug, InstrumentKind } from '@/core/types/portfolio'
import {
  fetchJson,
  toPriceString,
  type InstrumentRef,
  type PriceProvider,
  type ProviderRun,
} from './types'

const BASE = 'https://api.twelvedata.com/quote'

/** Classes negociadas fora do Brasil. A BRAPI só cobre a B3. */
const INTL_CLASSES = new Set<AssetClassSlug>(['stocks', 'etfs-int'])

/** Naturezas negociadas em bolsa. Renda fixa e ativo customizado, não. */
const INTL_KINDS = new Set<InstrumentKind>(['STOCK', 'ETF'])

/**
 * Símbolos por requisição.
 *
 * O crédito é cobrado POR SÍMBOLO, não por chamada — juntar oito num pedido
 * gasta os mesmos oito créditos. O que o lote economiza é slot de taxa: o plano
 * gratuito permite 8 requisições por minuto, então oito ativos em um pedido
 * ocupam um slot em vez de oito.
 */
function maxPerRequest(): number {
  const raw = Number(process.env.TWELVEDATA_MAX_PER_REQUEST)
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 8
}

/** Teto de chamadas por sincronização. Protege os 800 créditos diários. */
const REQUEST_BUDGET = 10

interface TwelveDataQuote {
  symbol?: string
  currency?: string
  /** Último preço negociado. Vem como string — é assim que queremos. */
  close?: string | number | null
  /** Unix em segundos. */
  timestamp?: number
  datetime?: string
  /** Presente só quando ESTE símbolo falhou. */
  status?: string
  message?: string
}

/**
 * Stocks e ETFs internacionais.
 *
 * Opcional como os outros: sem `TWELVEDATA_API_KEY` o provider some do registry
 * e essas classes ficam com preço manual, sem erro na tela.
 *
 * As cotações voltam em USD e são gravadas em USD. A conversão para a moeda do
 * domínio acontece na leitura, com o câmbio do dia — gravar já convertido
 * apagaria o preço real do ativo e o deixaria refém de um câmbio antigo.
 */
export class TwelveDataProvider implements PriceProvider {
  readonly name = 'twelvedata'

  private get apiKey(): string | undefined {
    return process.env.TWELVEDATA_API_KEY?.trim() || undefined
  }

  isAvailable(): boolean {
    return this.apiKey !== undefined
  }

  supports(instrument: InstrumentRef): boolean {
    return INTL_CLASSES.has(instrument.classSlug) && INTL_KINDS.has(instrument.kind)
  }

  async fetchQuotes(instruments: InstrumentRef[]): Promise<ProviderRun> {
    if (!this.isAvailable()) {
      return {
        provider: this.name,
        quotes: [],
        missing: instruments.map((i) => i.symbol),
        error: 'TWELVEDATA_API_KEY não configurada',
      }
    }

    // `externalIds.twelvedata` permite qualificar a bolsa quando o ticker
    // colide entre praças — "VWCE:XETR" em vez de só "VWCE".
    const byKey = new Map(
      instruments.map((i) => [(i.externalIds.twelvedata ?? i.symbol).toUpperCase(), i]),
    )
    const chaves = [...byKey.keys()]
    const lotes = chunk(chaves, maxPerRequest()).slice(0, REQUEST_BUDGET)

    const quotes: ProviderRun['quotes'] = []
    const seen = new Set<string>()
    const falhas = new Map<string, string[]>()

    for (const [index, lote] of lotes.entries()) {
      if (index > 0) await sleep(200)

      try {
        const rows = await this.consultar(lote)

        for (const [chave, row] of rows) {
          const instrument = byKey.get(chave)
          if (!instrument) continue

          if (row.status === 'error') {
            // Falha de UM símbolo dentro do lote. Os outros seguem.
            const motivo = row.message ?? 'símbolo recusado'
            falhas.set(motivo, [...(falhas.get(motivo) ?? []), chave])
            continue
          }

          const price = toPriceString(row.close)
          if (!price) continue

          seen.add(chave)
          quotes.push({
            instrumentId: instrument.id,
            price,
            // Sem moeda declarada, USD: são as bolsas que este provider cobre.
            // Assumir BRL faria uma ação de US$ 200 valer R$ 200.
            currency: row.currency ?? 'USD',
            asOf: row.timestamp ? new Date(row.timestamp * 1000) : new Date(),
            logoUrl: null,
          })
        }
      } catch (error) {
        const motivo = error instanceof Error ? error.message : 'erro desconhecido'
        falhas.set(motivo, [...(falhas.get(motivo) ?? []), ...lote])
      }
    }

    const excedentes = chaves.length - lotes.flat().length

    return {
      provider: this.name,
      quotes,
      missing: [...byKey].filter(([k]) => !seen.has(k)).map(([, i]) => i.symbol),
      error: resumirFalhas(falhas, excedentes),
    }
  }

  /**
   * Normaliza as duas formas de resposta.
   *
   * Com vários símbolos a API devolve um objeto indexado por ticker; com um só,
   * devolve a cotação solta na raiz. Tratar só o caso do lote quebraria
   * exatamente quando o usuário tem um único ativo internacional.
   */
  private async consultar(lote: string[]): Promise<[string, TwelveDataQuote][]> {
    const url =
      `${BASE}?symbol=${lote.map(encodeURIComponent).join(',')}` + `&apikey=${this.apiKey}`

    const data = await fetchJson<Record<string, unknown>>(url)

    // Erro global costuma vir com HTTP 200 e `status: "error"` no corpo.
    if (data.status === 'error') {
      throw new Error(typeof data.message === 'string' ? data.message : 'consulta recusada')
    }

    if (typeof data.symbol === 'string' || typeof data.close !== 'undefined') {
      const solta = data as TwelveDataQuote
      return [[(solta.symbol ?? lote[0] ?? '').toUpperCase(), solta]]
    }

    return Object.entries(data).map(([chave, valor]) => [
      chave.toUpperCase(),
      valor as TwelveDataQuote,
    ])
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

function resumirFalhas(falhas: Map<string, string[]>, excedentes: number): string | undefined {
  const partes = [...falhas].map(([motivo, tickers]) => `${motivo} (${tickers.join(', ')})`)

  if (excedentes > 0) {
    partes.push(`${excedentes} ativo(s) ficaram de fora: orçamento de ${REQUEST_BUDGET} chamadas`)
  }

  return partes.length > 0 ? partes.join(' · ') : undefined
}
