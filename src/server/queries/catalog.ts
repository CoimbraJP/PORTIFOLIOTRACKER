import 'server-only'

import { count } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { tickerCatalog } from '@/db/schema'

/**
 * Quantos ativos estão catalogados.
 *
 * Sem RLS e sem filtro por tenant: o catálogo é dado de mercado, o mesmo para
 * todo mundo. Serve só para a tela dizer se a primeira carga já aconteceu.
 */
export async function countCatalog(): Promise<number> {
  const [row] = await getDb().select({ total: count() }).from(tickerCatalog)
  return row?.total ?? 0
}
