import { fetchJson } from '../providers/types'

const BASE = 'https://economia.awesomeapi.com.br/json/last'

interface Pair {
  bid: string
  ask: string
  create_date?: string
  timestamp?: string
}

export interface FxResult {
  base: string
  quote: string
  /** Taxa como texto: o Decimal converte sem passar por float. */
  rate: string
  asOf: Date
}

/**
 * Câmbio pela AwesomeAPI.
 *
 * Escolhida por três motivos: é brasileira (baixa latência a partir de
 * sa-east-1), não exige cadastro, e devolve as cotações de compra e venda
 * separadas.
 *
 * Usa o `bid` — a cotação de COMPRA. Para converter um ativo em dólar para
 * reais, o que interessa é quanto você receberia vendendo aquele dólar, não
 * quanto pagaria para comprá-lo. Usar o `ask` inflaria o patrimônio pelo
 * spread, que é justamente o erro que faz o número não bater com a corretora.
 */
export async function fetchFxRates(pairs: string[] = ['USD-BRL']): Promise<FxResult[]> {
  const data = await fetchJson<Record<string, Pair>>(`${BASE}/${pairs.join(',')}`)

  return Object.entries(data).flatMap(([key, value]) => {
    if (!value?.bid) return []

    // A chave vem sem hífen: "USDBRL".
    const base = key.slice(0, 3)
    const quote = key.slice(3, 6)

    const asOf = value.timestamp
      ? new Date(Number(value.timestamp) * 1000)
      : new Date()

    return [{ base, quote, rate: value.bid, asOf }]
  })
}
