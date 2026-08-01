import 'server-only'

import { asc } from 'drizzle-orm'
import { consolidateByClass } from '@/core/consolidation/by-class'
import { consolidateByInstrument } from '@/core/consolidation/by-instrument'
import { consolidateByWallet } from '@/core/consolidation/by-wallet'
import { divide, money, pctChange, sum } from '@/core/money/decimal'
import type { AssetClassSlug, PortfolioSummary, SnapshotPoint } from '@/core/types/portfolio'
import { ASSET_CLASSES } from '@/config/asset-classes'
import { withRls } from '@/db/rls'
import { portfolioSnapshot } from '@/db/schema'
import { loadPositions } from './load-positions'
import { loadDisplaySettings } from './display-settings'
import { convertMoney } from '@/core/money/display'

const CLASS_NAMES = Object.fromEntries(ASSET_CLASSES.map((c) => [c.slug, c.name])) as Record<
  AssetClassSlug,
  string
>

export interface PortfolioResult extends PortfolioSummary {
  missingQuotes: string[]
}

/**
 * O dashboard, agora sobre o banco.
 *
 * Substitui `mocks/portfolio.ts` sem que nenhum componente saiba: o retorno é o
 * mesmo `PortfolioSummary` de antes, e a consolidação continua sendo feita
 * pelas mesmas funções puras de `core/consolidation`. Só a origem mudou.
 */
export async function loadPortfolio(
  userId: string,
  tenantId: string,
): Promise<PortfolioResult> {
  const display = await loadDisplaySettings(tenantId)
  const { positions, wallets, missingQuotes } = await loadPositions(userId, tenantId, display)

  const totalValue = sum(positions.map((p) => p.currentValue))
  const totalCost = sum(positions.map((p) => p.totalCost))
  const totalIncome = sum(positions.map((p) => p.incomeTotal))
  const profit = totalValue.minus(totalCost).plus(totalIncome)

  const history = await loadHistory(userId, display, { totalValue, totalCost })

  // Base de comparação: o snapshot de ~30 dias atrás. Com histórico curto,
  // usa o ponto mais antigo que existir — melhor uma variação sobre período
  // menor do que fingir que não houve mudança.
  const monthAgo = history[Math.max(0, history.length - 31)]
  const periodBase = monthAgo?.totalValue ?? totalValue

  return {
    baseCurrency: display.base,
    display,
    totalValue,
    totalCost,
    totalIncome,
    profit,
    changePct: divide(profit, totalCost).times(100),
    periodChangePct: pctChange(periodBase, totalValue),
    periodChangeValue: totalValue.minus(periodBase),
    classes: consolidateByClass(positions, CLASS_NAMES),
    wallets: consolidateByWallet(positions, wallets),
    positions,
    consolidated: consolidateByInstrument(positions),
    history,
    missingQuotes,
  }
}

/**
 * Série de `portfolio_snapshot`.
 *
 * O último ponto é sempre substituído pelo valor de AGORA: o snapshot de hoje
 * só é gravado no fechamento, e até lá o gráfico mostraria um patrimônio
 * desatualizado no ponto mais visível da curva.
 *
 * Banco sem snapshot nenhum devolve um único ponto — o de hoje. O gráfico fica
 * pobre, mas honesto: o histórico começa quando o sistema começa.
 */
async function loadHistory(
  userId: string,
  display: Awaited<ReturnType<typeof loadDisplaySettings>>,
  current: { totalValue: ReturnType<typeof money>; totalCost: ReturnType<typeof money> },
): Promise<SnapshotPoint[]> {
  const rows = await withRls(userId, (tx) =>
    tx
      .select({
        date: portfolioSnapshot.date,
        totalValue: portfolioSnapshot.totalValue,
        totalCost: portfolioSnapshot.totalCost,
      })
      .from(portfolioSnapshot)
      .orderBy(asc(portfolioSnapshot.date)),
  )

  const today = new Date().toISOString().slice(0, 10)

  const points: SnapshotPoint[] = rows
    .filter((row) => row.date !== today)
    .map((row) => ({
      date: row.date,
      // Snapshot é gravado em BRL; a série acompanha a moeda base.
      totalValue: convertMoney(money(row.totalValue), 'BRL', display.base, display.usdBrl),
      totalCost: convertMoney(money(row.totalCost), 'BRL', display.base, display.usdBrl),
    }))

  points.push({ date: today, totalValue: current.totalValue, totalCost: current.totalCost })

  return points
}
