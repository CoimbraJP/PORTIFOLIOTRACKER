import { money, share, sum, type Money } from '../money/decimal'
import type { AssetClassSlug, ClassSummary, Position } from '../types/portfolio'

/**
 * Agrupa posições por classe de ativo.
 *
 * Função pura. Sem I/O, sem React, sem ORM — é o que permite testar o cálculo
 * de patrimônio sem subir banco nem browser.
 */
export function consolidateByClass(
  positions: readonly Position[],
  classNames: Readonly<Record<AssetClassSlug, string>>,
): ClassSummary[] {
  const groups = new Map<AssetClassSlug, Position[]>()

  for (const position of positions) {
    const bucket = groups.get(position.classSlug)
    if (bucket) bucket.push(position)
    else groups.set(position.classSlug, [position])
  }

  const totalValue = sum(positions.map((p) => p.currentValue))

  const summaries: ClassSummary[] = []

  for (const [slug, items] of groups) {
    const currentValue = sum(items.map((p) => p.currentValue))
    const totalCost = sum(items.map((p) => p.totalCost))
    const incomeTotal = sum(items.map((p) => p.incomeTotal))
    const profit = currentValue.minus(totalCost).plus(incomeTotal)

    summaries.push({
      slug,
      name: classNames[slug],
      positionsCount: items.length,
      currentValue,
      totalCost,
      incomeTotal,
      profit,
      changePct: percentOf(profit, totalCost),
      share: share(currentValue, totalValue),
    })
  }

  return summaries.sort((a, b) => b.currentValue.comparedTo(a.currentValue))
}

function percentOf(part: Money, base: Money): Money {
  if (base.isZero()) return money(0)
  return part.dividedBy(base).times(100)
}
