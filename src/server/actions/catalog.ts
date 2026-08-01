'use server'

import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { tickerCatalog } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'

export interface TickerSuggestion {
  symbol: string
  name: string
  logoUrl: string | null
  exchange: string | null
  externalIds: Record<string, string>
}

/** Poucas sugestões, escolhidas: uma lista longa não é ajuda, é ruído. */
const LIMIT = 8

/**
 * Sugere tickers da classe a partir do que já foi digitado.
 *
 * Sem RLS: o catálogo é dado de mercado, igual para todos os tenants. A sessão
 * ainda é exigida — não é informação para quem não entrou.
 *
 * A ordem privilegia quem começa com o texto digitado. Quem escreve "BB" quer
 * BBAS3 antes de "Banco BTG", mesmo que os dois casem.
 */
export async function searchTickers(
  classSlug: string,
  query: string,
): Promise<TickerSuggestion[]> {
  await requireTenant()

  const termo = query.trim()
  // Uma letra só devolveria centenas de papéis e nenhuma informação útil.
  if (termo.length < 2) return []

  const prefixo = `${termo}%`
  const contem = `%${termo}%`

  const rows = await getDb()
    .select({
      symbol: tickerCatalog.symbol,
      name: tickerCatalog.name,
      logoUrl: tickerCatalog.logoUrl,
      exchange: tickerCatalog.exchange,
      externalIds: tickerCatalog.externalIds,
    })
    .from(tickerCatalog)
    .where(
      and(
        eq(tickerCatalog.classSlug, classSlug),
        or(ilike(tickerCatalog.symbol, contem), ilike(tickerCatalog.name, contem)),
      ),
    )
    .orderBy(
      // Prefixo do código primeiro, prefixo do nome depois, relevância por
      // último. `false` ordena antes de `true` no Postgres, daí o `not`.
      sql`not (${tickerCatalog.symbol} ilike ${prefixo})`,
      sql`not (${tickerCatalog.name} ilike ${prefixo})`,
      asc(tickerCatalog.rank),
    )
    .limit(LIMIT)

  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    logoUrl: row.logoUrl,
    exchange: row.exchange,
    externalIds: (row.externalIds ?? {}) as Record<string, string>,
  }))
}

/**
 * Diz se o código existe no catálogo daquela classe.
 *
 * O formulário usa isto para pedir confirmação, não para bloquear: ativo
 * obscuro que a lista não cobre precisa continuar cadastrável. O que não pode é
 * um erro de digitação passar despercebido e virar ativo fantasma.
 */
export async function isKnownTicker(classSlug: string, symbol: string): Promise<boolean> {
  await requireTenant()

  const [row] = await getDb()
    .select({ symbol: tickerCatalog.symbol })
    .from(tickerCatalog)
    .where(
      and(
        eq(tickerCatalog.classSlug, classSlug),
        eq(tickerCatalog.symbol, symbol.trim().toUpperCase()),
      ),
    )
    .limit(1)

  return row !== undefined
}

/** Se a classe tem catálogo. Sem ele, não faz sentido pedir confirmação. */
export async function hasCatalog(classSlug: string): Promise<boolean> {
  await requireTenant()

  const [row] = await getDb()
    .select({ symbol: tickerCatalog.symbol })
    .from(tickerCatalog)
    .where(eq(tickerCatalog.classSlug, classSlug))
    .limit(1)

  return row !== undefined
}
