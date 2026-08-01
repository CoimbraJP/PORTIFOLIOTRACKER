import { describe, expect, it } from 'vitest'
import {
  incomeIdempotencyKey,
  matchCorporateActions,
  type CorporateActionInput,
} from '@/core/income/match-corporate-actions'
import { computePosition } from '@/core/ledger/compute-position'
import type { LedgerEntry } from '@/core/ledger/types'
import { money, sum } from '@/core/money/decimal'

/**
 * O critério de pronto da Fase 5, escrito como teste.
 *
 * "Você cadastra uma compra de BBAS3 de dois anos atrás e os dividendos do
 * período aparecem sozinhos, corretos." É o cenário inteiro: ledger, apuração
 * na data-com, imposto e idempotência.
 */

const COMPRA: LedgerEntry = {
  id: 'buy-1',
  type: 'BUY',
  occurredAt: new Date('2024-02-15T12:00:00Z'),
  quantity: money(1000),
  unitPrice: money('24.50'),
  fees: money(0),
  taxes: money(0),
  netAmount: money(24500),
  ratio: null,
  transferCost: null,
}

/** Proventos que a B3 anunciou depois da compra. */
const PROVENTOS: CorporateActionInput[] = [
  {
    id: 'ca-1',
    type: 'DIVIDEND',
    exDate: new Date('2024-05-20T00:00:00Z'),
    paymentDate: new Date('2024-06-10T00:00:00Z'),
    valuePerShare: money('0.42'),
    currency: 'BRL',
  },
  {
    id: 'ca-2',
    type: 'JCP',
    exDate: new Date('2024-11-18T00:00:00Z'),
    paymentDate: new Date('2024-12-05T00:00:00Z'),
    valuePerShare: money('0.30'),
    currency: 'BRL',
  },
  {
    id: 'ca-3',
    type: 'DIVIDEND',
    exDate: new Date('2025-05-19T00:00:00Z'),
    paymentDate: new Date('2025-06-09T00:00:00Z'),
    valuePerShare: money('0.55'),
    currency: 'BRL',
  },
  // Anunciado ANTES da compra: não pode entrar.
  {
    id: 'ca-0',
    type: 'DIVIDEND',
    exDate: new Date('2023-08-10T00:00:00Z'),
    paymentDate: new Date('2023-09-01T00:00:00Z'),
    valuePerShare: money('0.38'),
    currency: 'BRL',
  },
]

describe('compra antiga de BBAS3', () => {
  const recebidos = matchCorporateActions([COMPRA], PROVENTOS)

  it('traz os três proventos do período e ignora o anterior à compra', () => {
    expect(recebidos.map((r) => r.corporateActionId)).toEqual(['ca-1', 'ca-2', 'ca-3'])
  })

  it('calcula cada valor sobre as mil ações', () => {
    expect(recebidos[0]?.net.toString()).toBe('420')
    // JCP: 300 bruto menos 15% de IR retido.
    expect(recebidos[1]?.gross.toString()).toBe('300')
    expect(recebidos[1]?.taxes.toString()).toBe('45')
    expect(recebidos[1]?.net.toString()).toBe('255')
    expect(recebidos[2]?.net.toString()).toBe('550')
  })

  it('o ledger soma a renda sem mexer em quantidade nem preço médio', () => {
    // A garantia que sustenta o resto do produto: provento é dinheiro que
    // entra, não ação que aparece. Se alterasse quantidade, o preço médio
    // mudaria e o lucro do ativo ficaria errado para sempre.
    const comProventos: LedgerEntry[] = [
      COMPRA,
      ...recebidos.map((r) => ({
        id: r.corporateActionId,
        type: r.type,
        occurredAt: r.occurredAt,
        quantity: money(0),
        unitPrice: money(0),
        fees: money(0),
        taxes: r.taxes,
        netAmount: r.net,
        ratio: null,
        transferCost: null,
      })),
    ]

    const estado = computePosition(comProventos)

    expect(estado.quantity.toString()).toBe('1000')
    expect(estado.avgPrice.toString()).toBe('24.5')
    expect(estado.incomeTotal.toString()).toBe('1225')
    expect(estado.incomeTotal.toString()).toBe(sum(recebidos.map((r) => r.net)).toString())
  })

  it('rodar de novo produz as mesmas chaves — nada duplica', () => {
    const primeira = matchCorporateActions([COMPRA], PROVENTOS).map((r) =>
      incomeIdempotencyKey('pos-1', r.corporateActionId),
    )
    const segunda = matchCorporateActions([COMPRA], PROVENTOS).map((r) =>
      incomeIdempotencyKey('pos-1', r.corporateActionId),
    )

    expect(primeira).toEqual(segunda)
    expect(new Set(primeira).size).toBe(primeira.length)
  })

  it('vender no meio do caminho corta os proventos seguintes, não os passados', () => {
    const venda: LedgerEntry = {
      ...COMPRA,
      id: 'sell-1',
      type: 'SELL',
      occurredAt: new Date('2024-12-20T12:00:00Z'),
      quantity: money(1000),
      unitPrice: money('27.00'),
      netAmount: money(27000),
    }

    const depoisDaVenda = matchCorporateActions([COMPRA, venda], PROVENTOS)

    // Recebe os dois de 2024 — a venda foi depois das duas datas-com — e perde
    // o de 2025, quando já não tinha mais o papel.
    expect(depoisDaVenda.map((r) => r.corporateActionId)).toEqual(['ca-1', 'ca-2'])
  })
})
