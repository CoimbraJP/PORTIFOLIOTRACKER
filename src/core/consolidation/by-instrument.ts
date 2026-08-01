import { divide, sum, type Money } from '../money/decimal'
import type { AssetClassSlug, Position } from '../types/portfolio'

export interface ConsolidatedInstrument {
  symbol: string
  name: string
  classSlug: AssetClassSlug
  logoUrl: string | null
  quantity: Money
  /** Preço médio ponderado somando TODAS as carteiras. */
  avgPrice: Money
  currentPrice: Money
  totalCost: Money
  currentValue: Money
  incomeTotal: Money
  /** Em quantas carteiras este ativo aparece. */
  walletCount: number
  walletNames: string[]
}

/**
 * Consolida o mesmo ativo entre carteiras diferentes.
 *
 * É o que responde "quanto de BTC eu tenho no total?" quando ele está na
 * Binance, na Ledger e na Metamask. O agrupamento é por símbolo canônico do
 * instrumento — nunca por texto digitado pelo usuário. Ver docs/00 §3.2.
 *
 * O preço médio consolidado NÃO é a média dos preços médios: é o custo total
 * dividido pela quantidade total. Média de médias mente quando as quantidades
 * são diferentes.
 */
export function consolidateByInstrument(
  positions: readonly Position[],
): ConsolidatedInstrument[] {
  const groups = new Map<string, Position[]>()

  for (const position of positions) {
    const bucket = groups.get(position.symbol)
    if (bucket) bucket.push(position)
    else groups.set(position.symbol, [position])
  }

  const result: ConsolidatedInstrument[] = []

  for (const [symbol, items] of groups) {
    const first = items[0]
    if (!first) continue

    const quantity = sum(items.map((p) => p.quantity))
    const totalCost = sum(items.map((p) => p.totalCost))

    result.push({
      symbol,
      name: first.name,
      classSlug: first.classSlug,
      logoUrl: first.logoUrl,
      quantity,
      avgPrice: divide(totalCost, quantity),
      currentPrice: first.currentPrice,
      totalCost,
      currentValue: sum(items.map((p) => p.currentValue)),
      incomeTotal: sum(items.map((p) => p.incomeTotal)),
      walletCount: items.length,
      walletNames: items.map((p) => p.walletName),
    })
  }

  return result.sort((a, b) => b.currentValue.comparedTo(a.currentValue))
}
