import 'server-only'

import { desc, eq, isNull, sql } from 'drizzle-orm'
import { money, sum, type Money } from '@/core/money/decimal'
import { getDb } from '@/db/client'
import {
  assetClass,
  fxRate,
  instrument,
  portfolioSnapshot,
  position,
  quote,
  tenant,
  valuation,
  wallet,
} from '@/db/schema'

/** Quantos reais valia um dólar na última sincronização de câmbio. */
async function latestUsdBrl(db: ReturnType<typeof getDb>): Promise<Money | null> {
  const [row] = await db
    .select({ rate: fxRate.rate })
    .from(fxRate)
    .where(eq(fxRate.base, 'USD'))
    .orderBy(desc(fxRate.asOf))
    .limit(1)

  return row ? money(row.rate) : null
}

export interface SnapshotReport {
  tenants: number
  written: number
}

/**
 * Fotografa o patrimônio de cada tenant no fim do dia.
 *
 * Diferente das cotações, este job precisa varrer TODOS os tenants — por isso
 * roda com a conexão privilegiada e filtra por tenant explicitamente, em vez de
 * assumir um contexto de RLS. É o único job que toca dado de tenant, e a
 * responsabilidade de não misturar carteira alheia é do `where` daqui.
 *
 * Grava o `breakdown` VERDADEIRO — valor por classe e por carteira naquele dia.
 * É o que faz o gráfico de uma carteira específica existir sem precisar ser
 * estimado a partir do total, como o seed precisou fazer.
 *
 * Idempotente pela chave `(tenant, data)`: rodar duas vezes no mesmo dia
 * atualiza em vez de duplicar.
 */
export async function dailySnapshotJob(date = new Date()): Promise<SnapshotReport> {
  const db = getDb()
  const day = date.toISOString().slice(0, 10)

  const tenants = await db.select({ id: tenant.id }).from(tenant)
  let written = 0

  // O snapshot é gravado na moeda de negociação do domínio (BRL), então uma
  // cotação em dólar precisa ser convertida aqui também. Sem isso a foto do dia
  // registraria uma ação de US$ 230 como R$ 230, e o gráfico de evolução
  // carregaria esse erro para sempre — snapshot não se recalcula.
  const usdBrl = await latestUsdBrl(db)

  for (const { id: tenantId } of tenants) {
    const rows = await db
      .select({
        positionId: position.id,
        quantity: position.quantity,
        totalCost: position.totalCost,
        incomeTotal: position.incomeTotal,
        avgPrice: position.avgPrice,
        instrumentId: instrument.id,
        walletId: wallet.id,
        classSlug: assetClass.slug,
        valuationMode: assetClass.valuationMode,
      })
      .from(position)
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(sql`${position.tenantId} = ${tenantId} and ${position.deletedAt} is null`)

    if (rows.length === 0) continue

    const prices = await db
      .selectDistinctOn([quote.instrumentId], {
        instrumentId: quote.instrumentId,
        price: quote.price,
        currency: quote.currency,
      })
      .from(quote)
      // `created_at`, não `as_of` — mesma razão de `loadPositions`: fonte com
      // atraso carimba o preço no passado, e a foto do dia tem que usar a
      // última cotação CONHECIDA, não a de carimbo mais novo.
      .orderBy(quote.instrumentId, desc(quote.createdAt))

    const priceById = new Map<string, string>()

    for (const p of prices) {
      if (p.currency === 'USD') {
        // Sem câmbio, a cotação é descartada e a posição cai no custo. Errar
        // para o conservador é melhor do que gravar um valor 5x menor numa
        // linha do histórico que ninguém vai revisar depois.
        if (!usdBrl) continue
        priceById.set(p.instrumentId, money(p.price).times(usdBrl).toString())
        continue
      }

      priceById.set(p.instrumentId, p.price)
    }

    const valuations = await db
      .selectDistinctOn([valuation.positionId], {
        positionId: valuation.positionId,
        value: valuation.value,
      })
      .from(valuation)
      .where(isNull(valuation.deletedAt))
      .orderBy(valuation.positionId, desc(valuation.valuedAt))

    const valueById = new Map(valuations.map((v) => [v.positionId, v.value]))

    const byClass = new Map<string, Money>()
    const byWallet = new Map<string, Money>()
    const values: Money[] = []
    const costs: Money[] = []
    const incomes: Money[] = []

    for (const row of rows) {
      const quantity = money(row.quantity)

      // Mesma ordem de precedência de `loadPositions`: avaliação manual para
      // bens únicos, cotação para o resto, custo como último recurso.
      const explicit = valueById.get(row.positionId)
      const quoted = priceById.get(row.instrumentId)

      const value = explicit
        ? money(explicit)
        : quoted
          ? quantity.times(money(quoted))
          : money(row.totalCost)

      values.push(value)
      costs.push(money(row.totalCost))
      incomes.push(money(row.incomeTotal))

      byClass.set(row.classSlug, (byClass.get(row.classSlug) ?? money(0)).plus(value))
      byWallet.set(row.walletId, (byWallet.get(row.walletId) ?? money(0)).plus(value))
    }

    await db
      .insert(portfolioSnapshot)
      .values({
        tenantId,
        date: day,
        totalValue: sum(values).toFixed(10),
        totalCost: sum(costs).toFixed(10),
        totalIncome: sum(incomes).toFixed(10),
        breakdown: {
          byClass: toPlain(byClass),
          byWallet: toPlain(byWallet),
        },
      })
      .onConflictDoUpdate({
        target: [portfolioSnapshot.tenantId, portfolioSnapshot.date],
        set: {
          totalValue: sum(values).toFixed(10),
          totalCost: sum(costs).toFixed(10),
          totalIncome: sum(incomes).toFixed(10),
          breakdown: {
            byClass: toPlain(byClass),
            byWallet: toPlain(byWallet),
          },
        },
      })

    written += 1
  }

  return { tenants: tenants.length, written }
}

function toPlain(map: Map<string, Money>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of map) result[key] = value.toFixed(2)
  return result
}

/**
 * Refaz a foto do dia depois de uma escrita que JÁ terminou com sucesso.
 *
 * Excluir um ativo, editar um lançamento, importar ou reconstruir histórico
 * são operações atômicas por si — cada uma já commitou dentro da própria
 * transação antes de chegar aqui. O que vem depois é só manutenção do gráfico
 * de evolução, e uma falha nele não pode virar `{ ok: false }` para uma
 * operação que o usuário já viu (ou vai ver) como concluída. Reportar "deu
 * erro" para algo que funcionou é pior do que não reportar nada: a pessoa
 * tenta de novo, se confunde com o resultado, ou desconfia do sistema à toa.
 *
 * Por isso este helper nunca propaga — ele registra e segue. O pior caso é o
 * gráfico ficar um dia atrasado até a próxima sincronização, o que já é a
 * mesma tolerância que o job noturno tem para qualquer outro atraso.
 */
export async function refazerSnapshotSemFalhar(): Promise<void> {
  try {
    await dailySnapshotJob()
  } catch (error) {
    console.error(
      '[daily-snapshot] falhou depois de uma escrita já confirmada — gráfico fica um dia atrasado:',
      error,
    )
  }
}
