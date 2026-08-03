import 'server-only'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { withRls } from '@/db/rls'
import { assetClass, instrument, position, quote, wallet } from '@/db/schema'

export interface CryptoIdRow {
  positionId: string
  symbol: string
  name: string
  /** Id da CoinGecko em uso. Nulo quando o ativo não é cotado por lá. */
  coingeckoId: string | null
  /** `false` quando o ativo já foi corrigido só para esta conta. */
  isGlobal: boolean
  /** Última cotação conhecida, em BRL. Serve para o usuário reconhecer a moeda. */
  price: string | null
  quantity: string
}

/**
 * As criptos do tenant e de qual moeda cada uma está puxando preço.
 *
 * Existe porque ticker de cripto colide e o erro é invisível: o preço é real, o
 * ativo é real, e só quem conhece a moeda percebe que é a errada. Mostrar o id
 * ao lado do preço transforma um "número estranho" em "está apontando para a
 * moeda errada".
 */
export async function loadCryptoIds(userId: string, tenantId: string): Promise<CryptoIdRow[]> {
  return withRls(userId, async (tx) => {
    const rows = await tx
      .select({
        positionId: position.id,
        quantity: position.quantity,
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        isGlobal: instrument.isGlobal,
        externalIds: instrument.externalIds,
      })
      .from(position)
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(
        and(
          eq(position.tenantId, tenantId),
          eq(assetClass.slug, 'cripto'),
          isNull(position.deletedAt),
          isNull(wallet.deletedAt),
        ),
      )

    if (rows.length === 0) return []

    const precos = await tx
      .selectDistinctOn([quote.instrumentId], {
        instrumentId: quote.instrumentId,
        price: quote.price,
      })
      .from(quote)
      .orderBy(quote.instrumentId, desc(quote.createdAt))

    const precoPorInstrumento = new Map(precos.map((p) => [p.instrumentId, p.price]))

    return rows
      .map((row) => ({
        positionId: row.positionId,
        symbol: row.symbol,
        name: row.name,
        coingeckoId: (row.externalIds as Record<string, string>).coingecko ?? null,
        isGlobal: row.isGlobal,
        price: precoPorInstrumento.get(row.instrumentId) ?? null,
        quantity: row.quantity,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  })
}
