import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { getDb } from '@/db/client'
import { tickerCatalog } from '@/db/schema'

export interface CatalogMatch {
  name: string
  currency: string
  logoUrl: string | null
  externalIds: Record<string, string>
}

/**
 * Procura símbolos no catálogo daquela classe.
 *
 * Devolve a linha inteira, não um sim/não: o catálogo já traz logo, moeda e os
 * ids externos, e descartá-los para depois buscar tudo de novo seria trabalho
 * repetido. O `external_ids` importa mais do que parece — é por ele que a
 * CoinGecko resolve a moeda certa, e sem ele uma cripto fora da lista embutida
 * ficaria sem cotação para sempre.
 *
 * Fora do `withRls` de propósito: o catálogo é dado de mercado, sem tenant.
 *
 * Em lote porque a importação pergunta por cinquenta símbolos de uma vez, e
 * cinquenta idas ao banco por arquivo é o tipo de coisa que só dói em produção.
 */
export async function findManyInCatalog(
  classSlug: AssetClassSlug,
  symbols: string[],
): Promise<Map<string, CatalogMatch>> {
  const unicos = [...new Set(symbols.map((s) => s.toUpperCase()))]
  if (unicos.length === 0) return new Map()

  const rows = await getDb()
    .select({
      symbol: tickerCatalog.symbol,
      name: tickerCatalog.name,
      currency: tickerCatalog.currency,
      logoUrl: tickerCatalog.logoUrl,
      externalIds: tickerCatalog.externalIds,
    })
    .from(tickerCatalog)
    .where(and(eq(tickerCatalog.classSlug, classSlug), inArray(tickerCatalog.symbol, unicos)))

  return new Map(
    rows.map((row) => [
      row.symbol,
      {
        name: row.name,
        currency: row.currency,
        logoUrl: row.logoUrl,
        externalIds: (row.externalIds ?? {}) as Record<string, string>,
      },
    ]),
  )
}

export async function findInCatalog(
  classSlug: AssetClassSlug,
  symbol: string,
): Promise<CatalogMatch | null> {
  return (await findManyInCatalog(classSlug, [symbol])).get(symbol.toUpperCase()) ?? null
}
