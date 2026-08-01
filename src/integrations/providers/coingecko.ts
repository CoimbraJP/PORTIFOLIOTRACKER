import {
  fetchJson,
  toPriceString,
  type InstrumentRef,
  type PriceProvider,
  type ProviderRun,
} from './types'

const BASE = 'https://api.coingecko.com/api/v3'

/**
 * Mapa símbolo → id da CoinGecko.
 *
 * A API é indexada por id, não por ticker, e ticker de cripto colide (existem
 * várias moedas chamadas "ONDO"). Adivinhar o id a partir do símbolo devolveria
 * o preço da moeda errada em silêncio — o pior tipo de bug num sistema de
 * patrimônio. Por isso o id vive em `instrument.external_ids`, e este mapa só
 * cobre os casos conhecidos do seed.
 */
const KNOWN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ONDO: 'ondo-finance',
  PENDLE: 'pendle',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  DOGE: 'dogecoin',
}

interface MarketRow {
  id: string
  symbol: string
  current_price?: number | string | null
  image: string | null
  last_updated: string | null
}

export function coinGeckoId(instrument: InstrumentRef): string | null {
  return instrument.externalIds.coingecko ?? KNOWN_IDS[instrument.symbol.toUpperCase()] ?? null
}

export class CoinGeckoProvider implements PriceProvider {
  readonly name = 'coingecko'

  /** O plano gratuito não exige chave. */
  isAvailable(): boolean {
    return true
  }

  /** Classe, natureza e id conhecido — os três, pelo mesmo motivo do brapi. */
  supports(instrument: InstrumentRef): boolean {
    return (
      instrument.classSlug === 'cripto' &&
      instrument.kind === 'CRYPTO' &&
      coinGeckoId(instrument) !== null
    )
  }

  async fetchQuotes(instruments: InstrumentRef[]): Promise<ProviderRun> {
    const byId = new Map<string, InstrumentRef>()
    const missing: string[] = []

    for (const instrument of instruments) {
      const id = coinGeckoId(instrument)
      if (id) byId.set(id, instrument)
      else missing.push(instrument.symbol)
    }

    if (byId.size === 0) {
      return { provider: this.name, quotes: [], missing }
    }

    const url =
      `${BASE}/coins/markets?vs_currency=brl` +
      `&ids=${[...byId.keys()].join(',')}` +
      `&per_page=250&sparkline=false`

    try {
      const rows = await fetchJson<MarketRow[]>(url)
      const seen = new Set<string>()

      const quotes = rows.flatMap((row) => {
        const instrument = byId.get(row.id)
        if (!instrument) return []

        const price = toPriceString(row.current_price)
        // Sem preço válido a moeda fica em `missing`, e a tela avisa.
        if (!price) return []

        seen.add(row.id)

        return [
          {
            instrumentId: instrument.id,
            price,
            currency: 'BRL',
            asOf: row.last_updated ? new Date(row.last_updated) : new Date(),
            logoUrl: row.image,
          },
        ]
      })

      for (const [id, instrument] of byId) {
        if (!seen.has(id)) missing.push(instrument.symbol)
      }

      return { provider: this.name, quotes, missing }
    } catch (error) {
      return {
        provider: this.name,
        quotes: [],
        missing: instruments.map((i) => i.symbol),
        error: error instanceof Error ? error.message : 'Falha na CoinGecko',
      }
    }
  }
}
