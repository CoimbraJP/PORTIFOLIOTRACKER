import { describe, expect, it } from 'vitest'
import { computePosition } from '@/core/ledger/compute-position'
import type { LedgerEntry, TransactionType } from '@/core/ledger/types'
import { divide, money, sum } from '@/core/money/decimal'

let seq = 0

function entry(
  type: TransactionType,
  date: string,
  v: Partial<Record<'quantity' | 'unitPrice' | 'fees' | 'taxes' | 'netAmount' | 'transferCost', string>> = {},
): LedgerEntry {
  seq += 1
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    type,
    occurredAt: new Date(`${date}T12:00:00Z`),
    quantity: money(v.quantity ?? 0),
    unitPrice: money(v.unitPrice ?? 0),
    fees: money(v.fees ?? 0),
    taxes: money(v.taxes ?? 0),
    netAmount: money(v.netAmount ?? 0),
    ratio: null,
    transferCost: v.transferCost ? money(v.transferCost) : null,
  }
}

/**
 * O fluxo que a interface passou a permitir.
 *
 * Os testes do motor cobrem cada tipo isoladamente. Estes cobrem a SEQUÊNCIA —
 * comprar, receber provento, vender parte e transferir o resto — porque é aí
 * que os efeitos se combinam e um erro de ordem apareceria.
 */
describe('compra → provento → venda parcial → transferência', () => {
  const origem: LedgerEntry[] = [
    entry('BUY', '2024-01-10', { quantity: '1000', unitPrice: '25', fees: '15' }),
    entry('BUY', '2024-04-02', { quantity: '500', unitPrice: '31' }),
    entry('DIVIDEND', '2024-06-14', { netAmount: '820' }),
    // JCP de R$ 400 bruto com 15% retidos: entra como 340 líquido, e `taxes`
    // guarda os 60 só como registro do que a empresa reteve.
    entry('JCP', '2024-09-14', { netAmount: '340', taxes: '60' }),
    entry('SELL', '2024-11-20', { quantity: '300', unitPrice: '34', fees: '12' }),
  ]

  it('preço médio inclui a taxa da compra e sobrevive à venda', () => {
    const state = computePosition(origem)

    // (1000 × 25 + 15 + 500 × 31) ÷ 1500
    expect(state.avgPrice.toFixed(4)).toBe('27.0100')
    expect(state.quantity.toString()).toBe('1200')
  })

  it('a venda realiza lucro sem tocar no preço médio do que restou', () => {
    const semVenda = computePosition(origem.slice(0, 4))
    const comVenda = computePosition(origem)

    expect(comVenda.avgPrice.toFixed(4)).toBe(semVenda.avgPrice.toFixed(4))
    // (34 × 300 − 12) − (27,01 × 300)
    expect(comVenda.realizedPnl.toFixed(2)).toBe('2085.00')
  })

  it('proventos acumulam líquidos de imposto e não mexem na posição', () => {
    const state = computePosition(origem)

    // 820 do dividendo isento + 340 do JCP já líquido
    expect(state.incomeTotal.toFixed(2)).toBe('1160.00')
  })

  it('transferir o restante move custo proporcional e não gera lucro', () => {
    const antes = computePosition(origem)
    const avgPrice = antes.avgPrice
    const movido = money('400')
    // É exatamente o que a Server Action calcula: custo = preço médio × qtd.
    const custoMovido = avgPrice.times(movido)

    const saida = computePosition([
      ...origem,
      entry('TRANSFER_OUT', '2024-12-01', { quantity: movido.toString() }),
    ])

    const entrada = computePosition([
      entry('TRANSFER_IN', '2024-12-01', {
        quantity: movido.toString(),
        transferCost: custoMovido.toFixed(10),
      }),
    ])

    // Nenhum lucro foi inventado na movimentação.
    expect(saida.realizedPnl.toFixed(2)).toBe(antes.realizedPnl.toFixed(2))
    expect(entrada.realizedPnl.isZero()).toBe(true)

    // Quantidade e custo apenas mudaram de lugar.
    expect(saida.quantity.plus(entrada.quantity).toString()).toBe(antes.quantity.toString())
    expect(saida.totalCost.plus(entrada.totalCost).toFixed(2)).toBe(antes.totalCost.toFixed(2))

    // E o preço médio é o mesmo dos dois lados.
    expect(entrada.avgPrice.toFixed(4)).toBe(avgPrice.toFixed(4))
    expect(saida.avgPrice.toFixed(4)).toBe(avgPrice.toFixed(4))
  })

  it('o consolidado das duas carteiras equivale a nunca ter transferido', () => {
    const semTransferir = computePosition(origem)

    const movido = money('400')
    const custoMovido = semTransferir.avgPrice.times(movido)

    const saida = computePosition([
      ...origem,
      entry('TRANSFER_OUT', '2024-12-01', { quantity: movido.toString() }),
    ])
    const entrada = computePosition([
      entry('TRANSFER_IN', '2024-12-01', {
        quantity: movido.toString(),
        transferCost: custoMovido.toFixed(10),
      }),
    ])

    const quantidade = sum([saida.quantity, entrada.quantity])
    const custo = sum([saida.totalCost, entrada.totalCost])

    expect(divide(custo, quantidade).toFixed(4)).toBe(semTransferir.avgPrice.toFixed(4))
  })
})

describe('venda total', () => {
  it('zera a posição e preserva o lucro realizado', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('SELL', '2024-08-10', { quantity: '100', unitPrice: '18', fees: '20', taxes: '30' }),
    ])

    expect(state.quantity.isZero()).toBe(true)
    expect(state.totalCost.isZero()).toBe(true)
    expect(state.avgPrice.isZero()).toBe(true)
    // (18 × 100 − 20 − 30) − 1000
    expect(state.realizedPnl.toFixed(2)).toBe('750.00')
  })
})
