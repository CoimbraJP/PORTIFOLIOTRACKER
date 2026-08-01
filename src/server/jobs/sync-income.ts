import 'server-only'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import {
  incomeIdempotencyKey,
  matchCorporateActions,
  type CorporateActionInput,
} from '@/core/income/match-corporate-actions'
import type { LedgerEntry, TransactionType } from '@/core/ledger/types'
import { money } from '@/core/money/decimal'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { getDb } from '@/db/client'
import {
  assetClass,
  corporateAction,
  instrument,
  position,
  transaction,
  wallet,
} from '@/db/schema'
import { fetchIncomeEvents, hasIncomeProvider } from '@/integrations/income/providers'
import type { InstrumentRef } from '@/integrations/providers/types'

export interface IncomeReport {
  /** Eventos de mercado novos ou atualizados. */
  actions: number
  /** Lançamentos de provento criados. */
  created: number
  /** Lançamentos que já existiam e tiveram o valor corrigido. */
  updated: number
  unresolved: string[]
  errors: { provider: string; message: string }[]
}

/**
 * Quanto histórico buscar quando o instrumento é novo.
 *
 * Cinco anos cobre o caso do brief — cadastrar uma compra antiga e ver os
 * proventos do período aparecerem — sem pedir a série inteira de uma empresa
 * centenária a cada sincronização.
 */
const BACKFILL_YEARS = 5

/**
 * Busca proventos e gera os lançamentos de quem tinha direito.
 *
 * Duas etapas separadas de propósito:
 *
 * 1. O evento de mercado vai para `corporate_action`, que é global. O dividendo
 *    do BBAS3 é o mesmo para todos os tenants, e buscá-lo uma vez é o que faz o
 *    custo de API crescer com o número de ativos, não de usuários.
 *
 * 2. O direito é apurado POR POSIÇÃO, reconstruindo a quantidade na data-com a
 *    partir do ledger. Quem vendeu depois da data-com recebe; quem comprou
 *    depois não. A posição de hoje não responde essa pergunta.
 */
export async function syncIncomeJob(): Promise<IncomeReport> {
  const db = getDb()

  const rows = await db
    .selectDistinct({
      id: instrument.id,
      symbol: instrument.symbol,
      kind: instrument.kind,
      externalIds: instrument.externalIds,
      classSlug: assetClass.slug,
    })
    .from(position)
    .innerJoin(instrument, eq(position.instrumentId, instrument.id))
    .innerJoin(wallet, eq(position.walletId, wallet.id))
    .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
    .where(isNull(position.deletedAt))

  const refs: InstrumentRef[] = rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    classSlug: row.classSlug as AssetClassSlug,
    kind: row.kind,
    externalIds: (row.externalIds ?? {}) as Record<string, string>,
  }))

  // Imóvel, empréstimo e cripto não têm provento anunciado por emissor. Mandar
  // ao provedor gastaria requisição para receber lista vazia.
  const elegiveis = refs.filter(hasIncomeProvider)

  const report: IncomeReport = {
    actions: 0,
    created: 0,
    updated: 0,
    unresolved: [],
    errors: [],
  }

  if (elegiveis.length === 0) return report

  const since = new Date()
  since.setUTCFullYear(since.getUTCFullYear() - BACKFILL_YEARS)

  const outcome = await fetchIncomeEvents(elegiveis, since.toISOString().slice(0, 10))
  report.unresolved = outcome.unresolved
  report.errors = outcome.errors

  // --- 1. eventos de mercado ------------------------------------------------
  //
  // Procura antes de gravar, em vez de `on conflict`: o índice de unicidade usa
  // `coalesce(payment_date, ex_date)` — provento anunciado e não pago tem
  // pagamento nulo, e nulos são distintos entre si no Postgres — e essa
  // expressão não cabe no `target` do drizzle. Fazer a busca aqui é explícito e
  // funciona igual; o índice continua sendo a rede de segurança do banco.
  for (const event of outcome.events) {
    const [existente] = await db
      .select({ id: corporateAction.id, valuePerShare: corporateAction.valuePerShare })
      .from(corporateAction)
      .where(
        and(
          eq(corporateAction.instrumentId, event.instrumentId),
          eq(corporateAction.type, event.type),
          eq(corporateAction.exDate, event.exDate),
          sql`coalesce(${corporateAction.paymentDate}, ${corporateAction.exDate}) = ${
            event.paymentDate ?? event.exDate
          }`,
        ),
      )
      .limit(1)

    if (existente) {
      // Rodar de novo atualiza, não empilha. O valor anunciado pode ser
      // corrigido depois do fato relevante, e nesse caso queremos o valor novo
      // no MESMO evento — dois eventos virariam provento em dobro.
      if (existente.valuePerShare === event.valuePerShare) continue

      await db
        .update(corporateAction)
        .set({
          valuePerShare: event.valuePerShare,
          paymentDate: event.paymentDate,
          raw: event.raw as Record<string, unknown>,
        })
        .where(eq(corporateAction.id, existente.id))

      report.actions += 1
      continue
    }

    await db.insert(corporateAction).values({
      instrumentId: event.instrumentId,
      type: event.type,
      exDate: event.exDate,
      paymentDate: event.paymentDate,
      valuePerShare: event.valuePerShare,
      currency: event.currency,
      provider: event.provider,
      raw: event.raw as Record<string, unknown>,
    })

    report.actions += 1
  }

  // --- 2. direito por posição ----------------------------------------------
  const instrumentIds = [...new Set(outcome.events.map((e) => e.instrumentId))]

  for (const instrumentId of instrumentIds) {
    const acoes = await db
      .select({
        id: corporateAction.id,
        type: corporateAction.type,
        exDate: corporateAction.exDate,
        paymentDate: corporateAction.paymentDate,
        valuePerShare: corporateAction.valuePerShare,
        currency: corporateAction.currency,
      })
      .from(corporateAction)
      .where(eq(corporateAction.instrumentId, instrumentId))

    const entradas: CorporateActionInput[] = acoes.flatMap((a) => {
      if (!a.valuePerShare) return []
      if (a.type !== 'DIVIDEND' && a.type !== 'JCP' && a.type !== 'INCOME') return []

      return [
        {
          id: a.id,
          type: a.type,
          exDate: new Date(`${a.exDate}T00:00:00Z`),
          paymentDate: a.paymentDate ? new Date(`${a.paymentDate}T00:00:00Z`) : null,
          valuePerShare: money(a.valuePerShare),
          currency: a.currency,
        },
      ]
    })

    if (entradas.length === 0) continue

    const posicoes = await db
      .select({ id: position.id, tenantId: position.tenantId })
      .from(position)
      .where(and(eq(position.instrumentId, instrumentId), isNull(position.deletedAt)))

    for (const pos of posicoes) {
      const resultado = await aplicarProventos(db, pos, entradas)
      report.created += resultado.created
      report.updated += resultado.updated
    }
  }

  return report
}

/**
 * Gera os lançamentos de uma posição a partir dos eventos do instrumento.
 *
 * O ledger é reconstruído SEM os proventos automáticos: incluí-los na apuração
 * da quantidade seria contar renda como se fosse ação comprada. Provento não
 * altera quantidade — é justamente essa a definição.
 */
async function aplicarProventos(
  db: ReturnType<typeof getDb>,
  pos: { id: string; tenantId: string },
  entradas: CorporateActionInput[],
): Promise<{ created: number; updated: number }> {
  const rows = await db
    .select({
      id: transaction.id,
      type: transaction.type,
      occurredAt: transaction.occurredAt,
      quantity: transaction.quantity,
      ratio: transaction.ratio,
    })
    .from(transaction)
    .where(and(eq(transaction.positionId, pos.id), isNull(transaction.deletedAt)))
    .orderBy(asc(transaction.occurredAt))

  const entries: LedgerEntry[] = rows.map((row) => ({
    id: row.id,
    type: row.type as TransactionType,
    occurredAt: row.occurredAt,
    quantity: money(row.quantity),
    unitPrice: money(0),
    fees: money(0),
    taxes: money(0),
    netAmount: money(0),
    ratio: row.ratio ? money(row.ratio) : null,
    transferCost: null,
  }))

  const recebidos = matchCorporateActions(entries, entradas)

  let created = 0
  let updated = 0

  for (const income of recebidos) {
    const chave = incomeIdempotencyKey(pos.id, income.corporateActionId)

    const [existente] = await db
      .select({ id: transaction.id, netAmount: transaction.netAmount })
      .from(transaction)
      .where(eq(transaction.idempotencyKey, chave))
      .limit(1)

    if (existente) {
      // Só toca no que mudou. O valor anunciado pode ser corrigido pelo emissor
      // depois do fato relevante; reescrever sempre sujaria `updated_at` de
      // milhares de linhas a cada execução sem nenhum ganho.
      if (money(existente.netAmount).equals(income.net)) continue

      await db
        .update(transaction)
        .set({
          quantity: '0',
          grossAmount: income.gross.toFixed(10),
          taxes: income.taxes.toFixed(10),
          netAmount: income.net.toFixed(10),
          occurredAt: income.occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(transaction.id, existente.id))

      updated += 1
      continue
    }

    await db.insert(transaction).values({
      tenantId: pos.tenantId,
      positionId: pos.id,
      type: income.type,
      occurredAt: income.occurredAt,
      // Provento não altera quantidade nem preço médio — é dinheiro que entra.
      quantity: '0',
      unitPrice: '0',
      grossAmount: income.gross.toFixed(10),
      taxes: income.taxes.toFixed(10),
      netAmount: income.net.toFixed(10),
      currency: income.currency,
      source: 'AUTO_CORPORATE_ACTION',
      corporateActionId: income.corporateActionId,
      idempotencyKey: chave,
    })

    created += 1
  }

  return { created, updated }
}
