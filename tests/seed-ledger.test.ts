import { describe, expect, it } from 'vitest'
import { computePosition } from '@/core/ledger/compute-position'
import type { LedgerEntry, TransactionType } from '@/core/ledger/types'
import { money, sum } from '@/core/money/decimal'
import { DEMO_POSITIONS } from '@/mocks/portfolio'

/**
 * O seed grava TRANSAÇÕES; a posição é derivada pelo motor de ledger.
 *
 * Este teste fecha o círculo: reproduz os lançamentos que o seed escreve e
 * exige que `computePosition` devolva exatamente a quantidade, o preço médio e
 * a renda que a demonstração promete. Se o motor regredir, o dashboard mostra
 * número errado — e é aqui que isso aparece, sem precisar de banco.
 */
function entriesFor(demo: (typeof DEMO_POSITIONS)[number]): LedgerEntry[] {
  const base = {
    fees: money(0),
    taxes: money(0),
    ratio: null,
    transferCost: null,
  }

  const entries: LedgerEntry[] = [
    {
      ...base,
      id: `${demo.id}:buy`,
      type: 'BUY' as TransactionType,
      occurredAt: new Date('2024-02-15T12:00:00Z'),
      quantity: money(demo.quantity),
      unitPrice: money(demo.avgPrice),
      netAmount: money(demo.quantity).times(money(demo.avgPrice)),
    },
  ]

  if (demo.income && demo.income !== '0') {
    entries.push({
      ...base,
      id: `${demo.id}:income`,
      type: 'DIVIDEND' as TransactionType,
      occurredAt: new Date('2025-06-20T12:00:00Z'),
      quantity: money(0),
      unitPrice: money(0),
      netAmount: money(demo.income),
    })
  }

  return entries
}

describe('seed → ledger → posição', () => {
  it.each(DEMO_POSITIONS.map((d) => [d.symbol, d] as const))(
    'reconstrói %s a partir das transações',
    (_symbol, demo) => {
      const state = computePosition(entriesFor(demo))

      expect(state.quantity.toString()).toBe(money(demo.quantity).toString())
      expect(state.avgPrice.toString()).toBe(money(demo.avgPrice).toString())
      expect(state.totalCost.toString()).toBe(
        money(demo.quantity).times(money(demo.avgPrice)).toString(),
      )
      expect(state.incomeTotal.toString()).toBe(money(demo.income ?? 0).toString())
    },
  )

  it('o patrimônio total da demonstração fecha em R$ 1.422.189', () => {
    const totalValue = sum(
      DEMO_POSITIONS.map((d) => money(d.quantity).times(money(d.currentPrice))),
    )
    expect(totalValue.toFixed(2)).toBe('1422189.00')
  })

  it('o custo total derivado do ledger fecha em R$ 1.104.797', () => {
    const totalCost = sum(
      DEMO_POSITIONS.map((d) => computePosition(entriesFor(d)).totalCost),
    )
    expect(totalCost.toFixed(2)).toBe('1104797.00')
  })

  it('a renda derivada do ledger fecha em R$ 61.380', () => {
    const income = sum(
      DEMO_POSITIONS.map((d) => computePosition(entriesFor(d)).incomeTotal),
    )
    expect(income.toFixed(2)).toBe('61380.00')
  })

  it('BTC consolidado entre Binance e Ledger dá preço médio ponderado', () => {
    const btc = DEMO_POSITIONS.filter((d) => d.symbol === 'BTC')
    const states = btc.map((d) => computePosition(entriesFor(d)))

    const quantity = sum(states.map((s) => s.quantity))
    const cost = sum(states.map((s) => s.totalCost))

    expect(quantity.toString()).toBe('0.43')
    // Média de médias daria 187.500 — e estaria errada.
    expect(cost.dividedBy(quantity).toFixed(2)).toBe('183837.21')
  })
})
