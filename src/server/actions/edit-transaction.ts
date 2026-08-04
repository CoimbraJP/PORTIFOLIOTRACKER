'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { money } from '@/core/money/decimal'
import { withRls } from '@/db/rls'
import { position, transaction } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { refazerSnapshotSemFalhar } from '@/server/jobs/daily-snapshot'
import { recomputePosition } from '@/server/services/recompute-position'
import { editTransactionSchema } from '@/server/validation/transaction'
import type { z } from 'zod'

type Editable = z.output<typeof editTransactionSchema>

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Corrige um lançamento existente.
 *
 * O ledger continua sendo a fonte da verdade: esta ação reescreve a LINHA e
 * manda recalcular. Em nenhum momento ela toca em quantidade ou preço médio da
 * posição — quem responde isso é o motor (CLAUDE.md §2.1).
 *
 * Provento automático não é editável. A próxima sincronização compararia o
 * valor com o do emissor e desfaria a correção, então aceitar a edição seria
 * prometer algo que não se cumpre.
 */
export async function updateTransaction(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = editTransactionSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const input = parsed.data

  try {
    await withRls(context.user.id, async (tx) => {
      const [atual] = await tx
        .select({
          id: transaction.id,
          type: transaction.type,
          positionId: transaction.positionId,
          source: transaction.source,
          transferGroupId: transaction.transferGroupId,
        })
        .from(transaction)
        .where(
          and(
            eq(transaction.id, input.id),
            eq(transaction.tenantId, context.tenantId),
            isNull(transaction.deletedAt),
          ),
        )
        .limit(1)

      if (!atual) throw new Error('Lançamento não encontrado.')
      if (atual.source === 'AUTO_CORPORATE_ACTION') {
        throw new Error('Provento automático não pode ser editado — ele é refeito a cada sincronização.')
      }
      if (atual.transferGroupId) {
        throw new Error('Transferência não pode ser editada. Apague e refaça.')
      }
      // Trocar o tipo não é corrigir, é substituir. Deixar passar produziria um
      // lançamento cujo histórico não corresponde ao que ele diz ser.
      if (atual.type !== input.type) {
        throw new Error('O tipo do lançamento não pode ser alterado.')
      }

      const occurredAt = new Date(`${input.occurredAt}T12:00:00Z`)
      const valores = camposDe(input)

      await tx
        .update(transaction)
        .set({ ...valores, occurredAt, notes: input.notes ?? null, updatedAt: new Date() })
        .where(eq(transaction.id, atual.id))

      await recomputePosition(tx, atual.positionId)
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  // O lançamento já foi corrigido com sucesso neste ponto. A foto do dia foi
  // tirada com o valor antigo e precisa ser refeita, mas uma falha aqui não
  // desfaz a correção — só atrasa o gráfico, e não pode voltar como erro para
  // uma operação que já terminou.
  await refazerSnapshotSemFalhar()

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Apaga um lançamento.
 *
 * Apaga de verdade, pela mesma razão de `deletePosition`: quem clica aqui está
 * dizendo que aquilo nunca deveria ter existido, e guardar um erro de digitação
 * não audita nada.
 *
 * Transferência sai INTEIRA. As duas pernas movem o mesmo custo entre
 * carteiras; apagar uma só faria custo aparecer ou sumir do nada, e o preço
 * médio das duas posições ficaria errado para sempre.
 */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  const context = await requireTenant()

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'Lançamento inválido.' }
  }

  try {
    await withRls(context.user.id, async (tx) => {
      const [alvo] = await tx
        .select({
          id: transaction.id,
          positionId: transaction.positionId,
          source: transaction.source,
          transferGroupId: transaction.transferGroupId,
        })
        .from(transaction)
        .where(
          and(
            eq(transaction.id, id),
            eq(transaction.tenantId, context.tenantId),
            isNull(transaction.deletedAt),
          ),
        )
        .limit(1)

      if (!alvo) throw new Error('Lançamento não encontrado.')
      if (alvo.source === 'AUTO_CORPORATE_ACTION') {
        throw new Error('Provento automático não pode ser apagado — ele volta na próxima sincronização.')
      }

      // Descobre tudo que sai junto ANTES de apagar, para saber quais posições
      // precisam ser recalculadas depois.
      const irmaos = alvo.transferGroupId
        ? await tx
            .select({ id: transaction.id, positionId: transaction.positionId })
            .from(transaction)
            .where(eq(transaction.transferGroupId, alvo.transferGroupId))
        : [{ id: alvo.id, positionId: alvo.positionId }]

      await tx.delete(transaction).where(
        inArray(
          transaction.id,
          irmaos.map((t) => t.id),
        ),
      )

      for (const posicao of new Set(irmaos.map((t) => t.positionId))) {
        await recomputePosition(tx, posicao)
      }
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  await refazerSnapshotSemFalhar()

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Traduz o formulário para as colunas do ledger.
 *
 * A mesma aritmética de `recordTransaction`, e é de propósito que ela esteja
 * escrita uma vez só: se a criação somasse taxa e a edição não, o mesmo
 * lançamento mudaria de valor só por ter sido corrigido.
 */
function camposDe(input: Editable) {
  // Discrimina pela PRESENÇA do campo, não pelo valor de `type`.
  //
  // O `type` da compra é `'BUY' | 'SELL'` e o do provento é uma união de seis
  // literais; o TypeScript não estreita a união pelo descarte de dois valores.
  // `in` estreita, e de quebra é mais honesto: o que muda a aritmética é ter
  // preço unitário, não o rótulo.
  if ('unitPrice' in input) {
    const quantity = money(input.quantity)
    const unitPrice = money(input.unitPrice)
    const fees = money(input.fees ?? 0)
    const taxes = money(input.taxes ?? 0)
    const gross = quantity.times(unitPrice)

    return {
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
    }
  }

  const gross = money(input.grossAmount)
  const taxes = money(input.taxes ?? 0)

  return {
    quantity: '0',
    unitPrice: '0',
    grossAmount: gross.toFixed(10),
    taxes: taxes.toFixed(10),
    // `net_amount` é o que ENTROU na conta. Ver `computePosition`.
    netAmount: gross.minus(taxes).toFixed(10),
  }
}

