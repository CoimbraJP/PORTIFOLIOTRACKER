import 'server-only'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
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
    /**
     * Ordem do replay: dia, depois ENTRADA antes de saída, depois inserção.
     *
     * Só `occurred_at` não bastava, e a falha era invisível. O ledger trabalha
     * por dia — todo lançamento é carimbado ao meio-dia —, então dois negócios
     * do mesmo dia têm o MESMO instante, e o Postgres devolve empate em ordem
     * arbitrária. Comprar e vender a mesma quantidade no mesmo dia às vezes
     * dava zero e às vezes dava a posição inteira, dependendo da ordem que o
     * banco escolhesse naquela execução.
     *
     * Entrada antes de saída é a única ordem que não inventa patrimônio: uma
     * venda sem posição é descartada pelo motor, e o que sobra é a compra —
     * um ativo que a pessoa não tem mais, valendo dinheiro na tela.
     *
     * `created_at` desempata o resto, para o mesmo ledger reconstruir sempre
     * igual: quantidade e preço médio são cache, e cache que muda sozinho
     * entre dois recálculos não é cache, é ruído.
     */
    .orderBy(
      asc(transaction.occurredAt),
      sql`case when ${transaction.type} in ('SELL', 'TRANSFER_OUT') then 1 else 0 end`,
      asc(transaction.createdAt),
    )

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
