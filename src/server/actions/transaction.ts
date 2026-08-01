'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { divide, money } from '@/core/money/decimal'
import { withRls } from '@/db/rls'
import { position, transaction, valuation, wallet } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { recomputePosition } from '@/server/services/recompute-position'
import { transactionSchema, type TransactionData } from '@/server/validation/transaction'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Registra qualquer lançamento manual.
 *
 * Um ponto de entrada só, com o tipo decidindo o comportamento — em vez de uma
 * ação por tipo, que multiplicaria a checagem de tenant, a transação e o
 * recálculo por cinco.
 *
 * Nenhum caminho calcula quantidade ou preço médio: todos gravam o fato e
 * chamam `recomputePosition`, que deriva do ledger. Ver CLAUDE.md §2.1.
 */
export async function recordTransaction(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = transactionSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const input = parsed.data
  const occurredAt = new Date(`${input.occurredAt}T12:00:00Z`)

  try {
    await withRls(context.user.id, async (tx) => {
      // O RLS já garante o tenant, mas confirmar a posição evita gravar
      // lançamento órfão quando o id vem errado.
      const [origem] = await tx
        .select({
          id: position.id,
          walletId: position.walletId,
          instrumentId: position.instrumentId,
          quantity: position.quantity,
          totalCost: position.totalCost,
        })
        .from(position)
        .where(and(eq(position.id, input.positionId), isNull(position.deletedAt)))
        .limit(1)

      if (!origem) throw new Error('Posição não encontrada.')

      switch (input.type) {
        case 'BUY':
        case 'SELL':
          await recordTrade(tx, context.tenantId, origem.id, input, occurredAt)
          break

        case 'TRANSFER':
          await recordTransfer(tx, context.tenantId, origem, input, occurredAt)
          break

        case 'VALUATION':
          await tx.insert(valuation).values({
            tenantId: context.tenantId,
            positionId: origem.id,
            valuedAt: input.occurredAt,
            value: money(input.value).toFixed(10),
            currency: 'BRL',
            method: 'MANUAL',
            notes: input.notes ?? null,
          })
          // Reavaliação não passa pelo ledger: nada a recalcular.
          return

        default:
          await recordIncome(tx, context.tenantId, origem.id, input, occurredAt)
          break
      }

      await recomputePosition(tx, origem.id)
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao lançar.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

type Tx = Parameters<Parameters<typeof withRls>[1]>[0]

async function recordTrade(
  tx: Tx,
  tenantId: string,
  positionId: string,
  input: Extract<TransactionData, { type: 'BUY' | 'SELL' }>,
  occurredAt: Date,
) {
  const quantity = money(input.quantity)
  const unitPrice = money(input.unitPrice)
  const fees = money(input.fees ?? 0)
  const taxes = money(input.taxes ?? 0)
  const gross = quantity.times(unitPrice)

  await tx.insert(transaction).values({
    tenantId,
    positionId,
    type: input.type,
    occurredAt,
    quantity: quantity.toFixed(10),
    unitPrice: unitPrice.toFixed(10),
    grossAmount: gross.toFixed(10),
    fees: fees.toFixed(10),
    taxes: taxes.toFixed(10),
    // Compra soma custos; venda desconta do que entrou.
    netAmount: (input.type === 'BUY'
      ? gross.plus(fees)
      : gross.minus(fees).minus(taxes)
    ).toFixed(10),
    currency: 'BRL',
    fxRate: '1',
    source: 'MANUAL',
    idempotencyKey: `manual:${randomUUID()}`,
    notes: input.notes ?? null,
  })
}

/**
 * Transferência: duas pernas ligadas pelo mesmo `transfer_group_id`.
 *
 * O custo que acompanha a quantidade sai do preço médio da origem, calculado
 * aqui — nunca digitado. É isso que impede o lucro fantasma que apareceria se
 * a saída fosse tratada como venda e a entrada como compra a preço de mercado.
 */
async function recordTransfer(
  tx: Tx,
  tenantId: string,
  origem: { id: string; walletId: string; instrumentId: string; quantity: string; totalCost: string },
  input: Extract<TransactionData, { type: 'TRANSFER' }>,
  occurredAt: Date,
) {
  const quantity = money(input.quantity)
  const disponivel = money(origem.quantity)

  if (quantity.greaterThan(disponivel)) {
    throw new Error(`Quantidade maior que a disponível (${disponivel.toString()}).`)
  }

  if (input.targetWalletId === origem.walletId) {
    throw new Error('A carteira de destino é a mesma da origem.')
  }

  const avgPrice = divide(money(origem.totalCost), disponivel)
  const custoTransferido = avgPrice.times(quantity)
  const group = randomUUID()

  // Posição de destino: cria se ainda não existir para este instrumento.
  const [existente] = await tx
    .select({ id: position.id })
    .from(position)
    .where(
      and(
        eq(position.walletId, input.targetWalletId),
        eq(position.instrumentId, origem.instrumentId),
        isNull(position.deletedAt),
      ),
    )
    .limit(1)

  const destinoId =
    existente?.id ??
    (
      await tx
        .insert(position)
        .values({
          tenantId,
          walletId: input.targetWalletId,
          instrumentId: origem.instrumentId,
          openedAt: input.occurredAt,
        })
        .returning({ id: position.id })
    )[0]!.id

  const comum = {
    tenantId,
    occurredAt,
    quantity: quantity.toFixed(10),
    unitPrice: avgPrice.toFixed(10),
    grossAmount: custoTransferido.toFixed(10),
    netAmount: custoTransferido.toFixed(10),
    currency: 'BRL',
    fxRate: '1',
    source: 'MANUAL' as const,
    transferGroupId: group,
    notes: input.notes ?? null,
  }

  await tx.insert(transaction).values([
    {
      ...comum,
      positionId: origem.id,
      type: 'TRANSFER_OUT',
      fees: money(input.fees ?? 0).toFixed(10),
      idempotencyKey: `transfer:${group}:out`,
    },
    {
      ...comum,
      positionId: destinoId,
      type: 'TRANSFER_IN',
      idempotencyKey: `transfer:${group}:in`,
    },
  ])

  // As duas pernas precisam ser recalculadas; a origem sai no fluxo principal.
  await recomputePosition(tx, destinoId)
}

async function recordIncome(
  tx: Tx,
  tenantId: string,
  positionId: string,
  input: Extract<TransactionData, { type: 'DIVIDEND' | 'JCP' | 'INCOME' | 'RENT' | 'INTEREST' | 'STAKING' }>,
  occurredAt: Date,
) {
  const gross = money(input.grossAmount)
  const taxes = money(input.taxes ?? 0)

  await tx.insert(transaction).values({
    tenantId,
    positionId,
    type: input.type,
    occurredAt,
    quantity: '0',
    unitPrice: '0',
    grossAmount: gross.toFixed(10),
    taxes: taxes.toFixed(10),
    // O motor desconta o IR ao acumular; guardamos o bruto e o imposto
    // separados para o relatório de renda passiva poder mostrar os dois.
    netAmount: gross.toFixed(10),
    currency: 'BRL',
    fxRate: '1',
    source: 'MANUAL',
    idempotencyKey: `manual:${randomUUID()}`,
    notes: input.notes ?? null,
  })
}

/** Carteiras da mesma classe, para o destino da transferência. */
export async function listTransferTargets(positionId: string) {
  const context = await requireTenant()

  return withRls(context.user.id, async (tx) => {
    const [origem] = await tx
      .select({ walletId: position.walletId, assetClassId: wallet.assetClassId })
      .from(position)
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .where(eq(position.id, positionId))
      .limit(1)

    if (!origem) return []

    return tx
      .select({ id: wallet.id, name: wallet.name })
      .from(wallet)
      .where(and(eq(wallet.assetClassId, origem.assetClassId), isNull(wallet.deletedAt)))
  })
}
