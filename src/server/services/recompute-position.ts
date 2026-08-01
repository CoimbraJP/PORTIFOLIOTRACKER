import 'server-only'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { computePosition } from '@/core/ledger/compute-position'
import type { LedgerEntry, TransactionType } from '@/core/ledger/types'
import { money } from '@/core/money/decimal'
import { position, transaction } from '@/db/schema'
import type { Database } from '@/db/client'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Reconstrói as colunas derivadas de uma posição a partir do ledger.
 *
 * Este é o único caminho pelo qual `position.quantity` e `position.avg_price`
 * são escritos. Nenhuma Server Action calcula esses valores por conta própria —
 * ela grava a transação e chama isto. É o que sustenta a regra de que o ledger
 * é a fonte da verdade e as colunas derivadas são cache reconstruível
 * (CLAUDE.md §2.1).
 *
 * Roda dentro da transação de quem chamou, para que lançamento e recálculo
 * sejam atômicos: um sem o outro deixaria a posição mentindo.
 */
export async function recomputePosition(tx: Tx, positionId: string): Promise<void> {
  const rows = await tx
    .select({
      id: transaction.id,
      type: transaction.type,
      occurredAt: transaction.occurredAt,
      quantity: transaction.quantity,
      unitPrice: transaction.unitPrice,
      fees: transaction.fees,
      taxes: transaction.taxes,
      netAmount: transaction.netAmount,
      ratio: transaction.ratio,
    })
    .from(transaction)
    .where(and(eq(transaction.positionId, positionId), isNull(transaction.deletedAt)))
    .orderBy(asc(transaction.occurredAt))

  const entries: LedgerEntry[] = rows.map((row) => ({
    id: row.id,
    type: row.type as TransactionType,
    occurredAt: row.occurredAt,
    quantity: money(row.quantity),
    unitPrice: money(row.unitPrice),
    fees: money(row.fees),
    taxes: money(row.taxes),
    netAmount: money(row.netAmount),
    ratio: row.ratio ? money(row.ratio) : null,
    transferCost: null,
  }))

  const state = computePosition(entries)

  await tx
    .update(position)
    .set({
      quantity: state.quantity.toFixed(10),
      avgPrice: state.avgPrice.toFixed(10),
      totalCost: state.totalCost.toFixed(10),
      realizedPnl: state.realizedPnl.toFixed(10),
      incomeTotal: state.incomeTotal.toFixed(10),
      recomputedAt: new Date(),
      // Posição zerada fecha; voltar a comprar reabre.
      closedAt: state.quantity.isZero() ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(eq(position.id, positionId))
}
