import { describe, expect, it } from 'vitest'
import { money } from '../../money/decimal'
import { computePosition, quantityAt } from '../compute-position'
import type { LedgerEntry, TransactionType } from '../types'

let seq = 0

function entry(
  type: TransactionType,
  date: string,
  values: Partial<Record<'quantity' | 'unitPrice' | 'fees' | 'taxes' | 'netAmount' | 'ratio' | 'transferCost', string>> = {},
): LedgerEntry {
  seq += 1
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    type,
    occurredAt: new Date(`${date}T12:00:00Z`),
    quantity: money(values.quantity ?? 0),
    unitPrice: money(values.unitPrice ?? 0),
    fees: money(values.fees ?? 0),
    taxes: money(values.taxes ?? 0),
    netAmount: money(values.netAmount ?? 0),
    ratio: values.ratio ? money(values.ratio) : null,
    transferCost: values.transferCost ? money(values.transferCost) : null,
  }
}

describe('computePosition', () => {
  it('deriva preço médio ponderado de duas compras', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('BUY', '2024-03-05', { quantity: '100', unitPrice: '20' }),
    ])

    expect(state.quantity.toString()).toBe('200')
    expect(state.avgPrice.toString()).toBe('15')
    expect(state.totalCost.toString()).toBe('3000')
  })

  it('soma taxas ao custo — corretagem faz parte do que você pagou', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10', fees: '25' }),
    ])

    expect(state.totalCost.toString()).toBe('1025')
    expect(state.avgPrice.toString()).toBe('10.25')
  })

  it('venda parcial realiza lucro e NÃO altera o preço médio', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('BUY', '2024-02-10', { quantity: '100', unitPrice: '20' }),
      entry('SELL', '2024-06-01', { quantity: '50', unitPrice: '30' }),
    ])

    // Preço médio antes da venda: 15. Lucro: (30 − 15) × 50 = 750.
    expect(state.realizedPnl.toString()).toBe('750')
    expect(state.quantity.toString()).toBe('150')
    expect(state.avgPrice.toString()).toBe('15')
    expect(state.totalCost.toString()).toBe('2250')
  })

  it('venda com prejuízo produz lucro realizado negativo', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '20' }),
      entry('SELL', '2024-05-10', { quantity: '40', unitPrice: '12' }),
    ])

    expect(state.realizedPnl.toString()).toBe('-320')
  })

  it('zera o custo quando a posição é totalmente vendida', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('SELL', '2024-05-10', { quantity: '100', unitPrice: '15' }),
    ])

    expect(state.quantity.isZero()).toBe(true)
    expect(state.totalCost.isZero()).toBe(true)
    expect(state.avgPrice.isZero()).toBe(true)
    expect(state.realizedPnl.toString()).toBe('500')
  })

  it('desdobramento multiplica a quantidade e preserva o custo total', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '40' }),
      entry('SPLIT', '2024-07-01', { ratio: '2' }),
    ])

    expect(state.quantity.toString()).toBe('200')
    expect(state.avgPrice.toString()).toBe('20')
    expect(state.totalCost.toString()).toBe('4000')
  })

  it('grupamento reduz a quantidade e preserva o custo total', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('REVERSE_SPLIT', '2024-07-01', { ratio: '0.1' }),
    ])

    expect(state.quantity.toString()).toBe('10')
    expect(state.avgPrice.toString()).toBe('100')
    expect(state.totalCost.toString()).toBe('1000')
  })

  it('bonificação aumenta a quantidade sem custo, derrubando o preço médio', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' }),
      entry('BONUS', '2024-08-01', { quantity: '10' }),
    ])

    expect(state.quantity.toString()).toBe('110')
    expect(state.totalCost.toString()).toBe('1000')
    // 1000 ÷ 110
    expect(state.avgPrice.toFixed(4)).toBe('9.0909')
  })

  it('transferência entre carteiras NÃO gera lucro — o erro clássico de cripto', () => {
    const origem = computePosition([
      entry('BUY', '2024-01-10', { quantity: '1', unitPrice: '200000' }),
      entry('TRANSFER_OUT', '2024-06-01', { quantity: '0.4' }),
    ])

    const destino = computePosition([
      entry('TRANSFER_IN', '2024-06-01', { quantity: '0.4', transferCost: '80000' }),
    ])

    expect(origem.realizedPnl.isZero()).toBe(true)
    expect(destino.realizedPnl.isZero()).toBe(true)

    // Preço médio preservado nos dois lados.
    expect(origem.avgPrice.toString()).toBe('200000')
    expect(destino.avgPrice.toString()).toBe('200000')

    // E o custo total somado continua sendo o original.
    expect(origem.totalCost.plus(destino.totalCost).toString()).toBe('200000')
  })

  it('proventos acumulam sem tocar quantidade nem custo', () => {
    // `netAmount` é o que ENTROU na conta: o JCP de R$ 600 bruto com 15% de IR
    // chega aqui como 510, e `taxes` fica só como registro do que foi retido.
    // Subtrair de novo descontaria o imposto duas vezes.
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '1000', unitPrice: '25' }),
      entry('DIVIDEND', '2024-04-15', { netAmount: '850' }),
      entry('JCP', '2024-07-15', { netAmount: '510', taxes: '90' }),
    ])

    expect(state.quantity.toString()).toBe('1000')
    expect(state.totalCost.toString()).toBe('25000')
    expect(state.incomeTotal.toString()).toBe('1360')
  })

  it('independe da ordem em que os lançamentos chegam', () => {
    const a = entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '10' })
    const b = entry('BUY', '2024-03-05', { quantity: '100', unitPrice: '20' })
    const c = entry('SELL', '2024-06-01', { quantity: '50', unitPrice: '30' })

    const ordenado = computePosition([a, b, c])
    const embaralhado = computePosition([c, a, b])

    expect(embaralhado.avgPrice.toString()).toBe(ordenado.avgPrice.toString())
    expect(embaralhado.realizedPnl.toString()).toBe(ordenado.realizedPnl.toString())
  })

  it('posição vazia devolve estado zerado sem estourar', () => {
    const state = computePosition([])

    expect(state.quantity.isZero()).toBe(true)
    expect(state.avgPrice.isZero()).toBe(true)
    expect(state.totalCost.isZero()).toBe(true)
  })
})

describe('compra e venda no mesmo dia', () => {
  // Caso real, vindo de uma carteira de cripto: as duas pernas do mesmo negócio
  // saíram com o mesmo carimbo de hora. O ledger trabalha por dia, então elas
  // empatam — e só uma das ordens descreve um fato possível.
  const compra = () => entry('BUY', '2026-05-21', { quantity: '207', unitPrice: '20' })
  const venda = () => entry('SELL', '2026-05-21', { quantity: '207', unitPrice: '57.48' })

  it('zera a posição, venha na ordem que vier', () => {
    expect(computePosition([compra(), venda()]).quantity.toString()).toBe('0')
    expect(computePosition([venda(), compra()]).quantity.toString()).toBe('0')
  })

  it('registra o lucro realizado dos dois jeitos', () => {
    // 207 × (57,48 − 20) = 7.758,36 — o mesmo que a corretora mostra.
    const esperado = '7758.36'

    expect(computePosition([compra(), venda()]).realizedPnl.toString()).toBe(esperado)
    expect(computePosition([venda(), compra()]).realizedPnl.toString()).toBe(esperado)
  })
})

describe('quantityAt — a pergunta da data-com', () => {
  const entries: LedgerEntry[] = [
    entry('BUY', '2024-01-10', { quantity: '1000', unitPrice: '25' }),
    entry('BUY', '2024-05-20', { quantity: '500', unitPrice: '28' }),
    entry('SELL', '2024-09-10', { quantity: '300', unitPrice: '32' }),
  ]

  it('devolve a quantidade detida na data, ignorando o futuro', () => {
    expect(quantityAt(entries, new Date('2024-03-01T00:00:00Z')).toString()).toBe('1000')
    expect(quantityAt(entries, new Date('2024-06-01T00:00:00Z')).toString()).toBe('1500')
    expect(quantityAt(entries, new Date('2024-12-01T00:00:00Z')).toString()).toBe('1200')
  })

  it('devolve zero antes do primeiro lançamento', () => {
    expect(quantityAt(entries, new Date('2023-12-31T00:00:00Z')).isZero()).toBe(true)
  })
})

describe('total aportado', () => {
  it('não diminui quando se vende', () => {
    // O custo cai — vender tira o custo da parte vendida —, mas o dinheiro que
    // já saiu do bolso continua tendo saído. É este número que a corretora
    // costuma chamar de "base de custo".
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '100', unitPrice: '30' }),
      entry('SELL', '2024-06-10', { quantity: '40', unitPrice: '45' }),
    ])

    expect(state.totalCost.toString()).toBe('1800')
    expect(state.totalInvested.toString()).toBe('3000')
  })

  it('soma as taxas, porque elas saíram do bolso também', () => {
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '10', unitPrice: '100', fees: '12.90' }),
    ])

    expect(state.totalInvested.toString()).toBe('1012.9')
  })

  it('vender tudo zera o custo mas não o aportado', () => {
    // A posição some das telas de patrimônio; o histórico de quanto passou por
    // ela não some junto.
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '50', unitPrice: '20' }),
      entry('SELL', '2024-02-10', { quantity: '50', unitPrice: '25' }),
    ])

    expect(state.totalCost.toString()).toBe('0')
    expect(state.totalInvested.toString()).toBe('1000')
  })

  it('bonificação não é aporte', () => {
    // Ação bonificada chega de graça: aumenta a quantidade e não o que se pagou.
    const state = computePosition([
      entry('BUY', '2024-01-10', { quantity: '1000', unitPrice: '10' }),
      entry('BONUS', '2024-12-10', { quantity: '50' }),
    ])

    expect(state.quantity.toString()).toBe('1050')
    expect(state.totalInvested.toString()).toBe('10000')
  })
})
