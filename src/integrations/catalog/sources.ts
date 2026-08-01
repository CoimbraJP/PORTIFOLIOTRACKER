import type { AssetClassSlug } from '@/core/types/portfolio'
import { fetchJson } from '@/integrations/providers/types'

/** Uma entrada do catálogo, antes de chegar ao banco. */
export interface CatalogEntry {
  symbol: string
  name: string
  classSlug: AssetClassSlug
  currency: string
  exchange: string | null
  logoUrl: string | null
  externalIds: Record<string, string>
  /** Menor é mais relevante. É a ordem em que a sugestão aparece. */
  rank: number
  provider: string
}

/* -------------------------------------------------------------------------- *
 * B3 — BRAPI
 * -------------------------------------------------------------------------- */

const BRAPI_TICKERS = 'https://brapi.dev/api/v2/tickers'

/** Teto de páginas. 2302 papéis em julho de 2026; 5 páginas dão folga. */
const MAX_PAGES = 5
const PAGE_SIZE = 2000

interface BrapiTicker {
  symbol?: string
  name?: string
  longName?: string
  subType?: string
  assetType?: string
  currency?: string
  exchange?: string
  logoUrl?: string | null
  isActive?: boolean
  quote?: { volume?: number | null }
}

/**
 * O `subType` da B3 traduzido para as classes do produto.
 *
 * `unit` é ação com pacote de papéis (TAEE11) e vai para Ações. BDR é recibo de
 * empresa estrangeira mas negocia na B3 em real, então também: quem compra BDR
 * compra pela corretora brasileira e declara como ativo brasileiro.
 *
 * Os fundos listados que não são FII — infra, agro, FIP, FIDC — vão para FIIs
 * por enquanto: são fundos de renda que se comportam igual na tela. Se um dia
 * merecerem classe própria, é aqui que a decisão muda.
 */
const CLASS_BY_SUBTYPE: Record<string, AssetClassSlug> = {
  stock: 'acoes-br',
  unit: 'acoes-br',
  bdr: 'acoes-br',
  fii: 'fiis',
  'fi-infra': 'fiis',
  'fi-agro': 'fiis',
  fip: 'fiis',
  fidc: 'fiis',
  etf: 'etfs',
}

export async function fetchB3Catalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = []
  let page = 1

  while (page <= MAX_PAGES) {
    // Ordenado por volume: o `rank` sai da própria ordem de chegada, então o
    // papel mais negociado aparece primeiro na sugestão sem cálculo extra.
    const url = `${BRAPI_TICKERS}?limit=${PAGE_SIZE}&page=${page}&sortBy=volume&sortOrder=desc`
    const data = await fetchJson<{
      results?: BrapiTicker[]
      pagination?: { hasNextPage?: boolean }
    }>(url, { timeoutMs: 20_000 })

    const rows = data.results ?? []
    if (rows.length === 0) break

    for (const row of rows) {
      const symbol = row.symbol?.toUpperCase()
      const classSlug = CLASS_BY_SUBTYPE[row.subType ?? '']

      // Índice, opção e o que não couber numa classe ficam de fora. Sugerir
      // ^BVSP como ativo comprável seria pior do que não sugerir nada.
      if (!symbol || !classSlug || row.isActive === false) continue

      entries.push({
        symbol,
        name: row.name ?? row.longName ?? symbol,
        classSlug,
        currency: row.currency ?? 'BRL',
        exchange: row.exchange ?? 'B3',
        logoUrl: row.logoUrl ?? null,
        externalIds: {},
        rank: entries.length,
        provider: 'brapi',
      })
    }

    if (!data.pagination?.hasNextPage) break
    page += 1
  }

  return entries
}

/* -------------------------------------------------------------------------- *
 * Cripto — CoinGecko
 * -------------------------------------------------------------------------- */

const COINGECKO_MARKETS = 'https://api.coingecko.com/api/v3/coins/markets'

interface CoinGeckoCoin {
  id?: string
  symbol?: string
  name?: string
  image?: string | null
}

/**
 * As 250 maiores por valor de mercado.
 *
 * Não a lista inteira: a CoinGecko cataloga mais de dez mil moedas, a maioria
 * sem liquidez, e oferecê-las no autocomplete atrapalharia mais do que ajuda.
 * O `id` vai junto porque é por ele que a cotação é buscada — ticker de cripto
 * colide, e sem o id o preço viria da moeda errada em silêncio.
 */
export async function fetchCryptoCatalog(): Promise<CatalogEntry[]> {
  const url = `${COINGECKO_MARKETS}?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`
  const rows = await fetchJson<CoinGeckoCoin[]>(url, { timeoutMs: 20_000 })

  return rows.flatMap((row, index) => {
    if (!row.id || !row.symbol) return []

    return [
      {
        symbol: row.symbol.toUpperCase(),
        name: row.name ?? row.symbol.toUpperCase(),
        classSlug: 'cripto' as const,
        currency: 'USD',
        exchange: null,
        logoUrl: row.image ?? null,
        externalIds: { coingecko: row.id },
        rank: index,
        provider: 'coingecko',
      },
    ]
  })
}

/* -------------------------------------------------------------------------- *
 * Stocks e ETFs internacionais — Twelve Data
 * -------------------------------------------------------------------------- */

const TWELVE_STOCKS = 'https://api.twelvedata.com/stocks'
const TWELVE_ETFS = 'https://api.twelvedata.com/etf'

interface TwelveSymbol {
  symbol?: string
  name?: string
  currency?: string
  exchange?: string
}

/**
 * NYSE e NASDAQ apenas.
 *
 * A Twelve Data cataloga bolsas do mundo inteiro, e trazer tudo seria uma
 * resposta de dezenas de megabytes para um campo de sugestão. Quem investe lá
 * fora por corretora brasileira compra nessas duas.
 */
export async function fetchInternationalCatalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = []

  const fontes = [
    { url: TWELVE_STOCKS, classSlug: 'stocks' as const },
    { url: TWELVE_ETFS, classSlug: 'etfs-int' as const },
  ]

  for (const fonte of fontes) {
    for (const exchange of ['NYSE', 'NASDAQ']) {
      const data = await fetchJson<{ data?: TwelveSymbol[]; status?: string; message?: string }>(
        `${fonte.url}?exchange=${exchange}`,
        { timeoutMs: 30_000 },
      )

      if (data.status === 'error') throw new Error(data.message ?? 'consulta recusada')

      for (const row of data.data ?? []) {
        if (!row.symbol) continue

        entries.push({
          symbol: row.symbol.toUpperCase(),
          name: row.name ?? row.symbol.toUpperCase(),
          classSlug: fonte.classSlug,
          currency: row.currency ?? 'USD',
          exchange: row.exchange ?? exchange,
          logoUrl: null,
          externalIds: {},
          // A lista vem sem ordem de relevância, então o rank aqui é só a
          // ordem de chegada. A busca por prefixo do código resolve o resto.
          rank: entries.length,
          provider: 'twelvedata',
        })
      }
    }
  }

  return entries
}
