import { money, share, sum, type Money } from '../money/decimal'
import type { Position, WalletKind, WalletSummary } from '../types/portfolio'

export interface WalletMeta {
  id: string
  name: string
  kind: WalletKind
}

/** Agrupa posições por carteira. Alimenta a visão estilo CoinMarketCap. */
export function consolidateByWallet(
  positions: readonly Position[],
  wallets: readonly WalletMeta[],
): WalletSummary[] {
  const metaById = new Map(wallets.map((w) => [w.id, w]))
  const groups = new Map<string, Position[]>()

  for (const position of positions) {
    const bucket = groups.get(position.walletId)
    if (bucket) bucket.push(position)
    else groups.set(position.walletId, [position])
  }

  const totalValue = sum(positions.map((p) => p.currentValue))
  const summaries: WalletSummary[] = []

  for (const [walletId, items] of groups) {
    const meta = metaById.get(walletId)
    const first = items[0]
    if (!meta || !first) continue

    const currentValue = sum(items.map((p) => p.currentValue))
    const totalCost = sum(items.map((p) => p.totalCost))
    const totalInvested = sum(items.map((p) => p.totalInvested))
    const income = sum(items.map((p) => p.incomeTotal))
    const profit = currentValue.minus(totalCost).plus(income)

    summaries.push({
      id: meta.id,
      name: meta.name,
      kind: meta.kind,
      classSlug: first.classSlug,
      positionsCount: items.length,
      currentValue,
      totalCost,
      totalInvested,
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
