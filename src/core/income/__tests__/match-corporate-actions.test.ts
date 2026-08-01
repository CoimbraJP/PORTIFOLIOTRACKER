import { describe, expect, it } from 'vitest'
import { money } from '../../money/decimal'
import type { LedgerEntry, TransactionType } from '../../ledger/types'
import {
  incomeIdempotencyKey,
  matchCorporateActions,
  quantityOn,
  type CorporateActionInput,
} from '../match-corporate-actions'

function entry(type: TransactionType, date: string, quantity: string): LedgerEntry {
  return {
    id: `${type}-${date}`,
    type,
    occurredAt: new Date(`${date}T12:00:00Z`),
    quantity: money(quantity),
    unitPrice: money(0),
    fees: money(0),
    taxes: money(0),
    netAmount: money(0),
    ratio: null,
    transferCost: null,
  }
}

function provento(
  type: CorporateActionInput['type'],
  exDate: string,
  valuePerShare: string,
  paymentDate: string | null = null,
): CorporateActionInput {
  return {
    id: `${type}-${exDate}`,
    type,
    exDate: new Date(`${exDate}T00:00:00Z`),
    paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00Z`) : null,
    valuePerShare: money(valuePerShare),
    currency: 'BRL',
  }
}

describe('quantidade na data-com', () => {
  it('soma compras e subtrai vendas até a data', () => {
    const ledger = [
      entry('BUY', '2024-01-10', '100'),
      entry('BUY', '2024-03-05', '50'),
      entry('SELL', '2024-06-20', '30'),
    ]

    expect(quantityOn(ledger, new Date('2024-02-01T00:00:00Z')).toString()).toBe('100')
    expect(quantityOn(ledger, new Date('2024-04-01T00:00:00Z')).toString()).toBe('150')
    expect(quantityOn(ledger, new Date('2024-07-01T00:00:00Z')).toString()).toBe('120')
  })

  it('compra NO dia da data-com dá direito', () => {
    // A data-com é o último dia COM direito, não o último dia antes dele.
    // Comparar por instante excluiria quem comprou naquela manhã.
    const ledger = [entry('BUY', '2024-05-15', '200')]

    expect(quantityOn(ledger, new Date('2024-05-15T00:00:00Z')).toString()).toBe('200')
  })

  it('desdobramento multiplica a quantidade anterior', () => {
    const split = entry('SPLIT', '2024-04-01', '0')
    split.ratio = money(2)

    const ledger = [entry('BUY', '2024-01-10', '100'), split]

    expect(quantityOn(ledger, new Date('2024-05-01T00:00:00Z')).toString()).toBe('200')
  })
})

describe('direito a provento', () => {
  it('quem vendeu DEPOIS da data-com continua recebendo', () => {
    // O erro clássico é olhar a posição de hoje. Quem tinha na data-com tem
    // direito, mesmo com a posição zerada quando o dinheiro cai.
    const ledger = [entry('BUY', '2023-01-10', '1000'), entry('SELL', '2024-03-20', '1000')]
    const eventos = [provento('DIVIDEND', '2024-03-10', '0.50', '2024-04-15')]

    const [recebido] = matchCorporateActions(ledger, eventos)

    expect(recebido?.quantity.toString()).toBe('1000')
    expect(recebido?.net.toString()).toBe('500')
  })

  it('quem comprou DEPOIS da data-com não recebe', () => {
    const ledger = [entry('BUY', '2024-03-11', '1000')]
    const eventos = [provento('DIVIDEND', '2024-03-10', '0.50', '2024-04-15')]

    expect(matchCorporateActions(ledger, eventos)).toEqual([])
  })

  it('usa a quantidade da data-com, não a de hoje', () => {
    const ledger = [
      entry('BUY', '2023-01-10', '1000'),
      entry('SELL', '2024-03-20', '600'),
      entry('BUY', '2024-05-01', '2000'),
    ]
    const eventos = [provento('DIVIDEND', '2024-03-10', '1.00', '2024-04-15')]

    const [recebido] = matchCorporateActions(ledger, eventos)

    // Tinha 1000 na data-com, tem 2400 hoje. O provento é sobre 1000.
    expect(recebido?.quantity.toString()).toBe('1000')
  })

  it('posição zerada na data-com não gera nada', () => {
    const ledger = [entry('BUY', '2023-01-10', '500'), entry('SELL', '2023-06-01', '500')]
    const eventos = [provento('DIVIDEND', '2024-03-10', '0.50', '2024-04-15')]

    expect(matchCorporateActions(ledger, eventos)).toEqual([])
  })
})

describe('imposto', () => {
  it('JCP entra líquido, com os 15% retidos visíveis', () => {
    const ledger = [entry('BUY', '2023-01-10', '1000')]
    const eventos = [provento('JCP', '2024-03-10', '1.00', '2024-04-15')]

    const [recebido] = matchCorporateActions(ledger, eventos)

    expect(recebido?.gross.toString()).toBe('1000')
    expect(recebido?.taxes.toString()).toBe('150')
    expect(recebido?.net.toString()).toBe('850')
  })

  it('dividendo e rendimento de FII são isentos', () => {
    const ledger = [entry('BUY', '2023-01-10', '1000')]

    for (const tipo of ['DIVIDEND', 'INCOME'] as const) {
      const [recebido] = matchCorporateActions(ledger, [provento(tipo, '2024-03-10', '1.00')])

      expect(recebido?.taxes.toString(), tipo).toBe('0')
      expect(recebido?.net.toString(), tipo).toBe('1000')
    }
  })
})

describe('data do lançamento', () => {
  it('usa a data de pagamento — é quando o dinheiro entra', () => {
    const ledger = [entry('BUY', '2023-01-10', '100')]
    const eventos = [provento('DIVIDEND', '2024-03-10', '1.00', '2024-04-15')]

    const [recebido] = matchCorporateActions(ledger, eventos)

    expect(recebido?.occurredAt.toISOString().slice(0, 10)).toBe('2024-04-15')
  })

  it('sem data de pagamento, ancora na data-com', () => {
    // Provento anunciado e ainda não pago precisa aparecer em algum mês; a
    // data-com é a única data conhecida.
    const ledger = [entry('BUY', '2023-01-10', '100')]
    const eventos = [provento('DIVIDEND', '2024-03-10', '1.00', null)]

    const [recebido] = matchCorporateActions(ledger, eventos)

    expect(recebido?.occurredAt.toISOString().slice(0, 10)).toBe('2024-03-10')
  })
})

describe('idempotência', () => {
  it('a chave depende só da posição e do evento', () => {
    // Não pode depender de valor nem de data de execução: se o provedor
    // corrigir o valor anunciado, tem que ser o mesmo lançamento atualizado,
    // não um segundo somando por cima.
    const a = incomeIdempotencyKey('pos-1', 'ca-9')
    const b = incomeIdempotencyKey('pos-1', 'ca-9')
    const c = incomeIdempotencyKey('pos-2', 'ca-9')

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
