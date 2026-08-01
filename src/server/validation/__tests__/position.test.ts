import { describe, expect, it } from 'vitest'
import { money } from '@/core/money/decimal'
import { convertMoney } from '@/core/money/display'
import { newPositionSchema } from '../position'

const BASE = {
  classSlug: 'stocks',
  walletId: '',
  newWalletName: 'Avenue',
  symbol: 'AAPL',
  quantity: '10',
  unitCost: '200,00',
}

describe('lançamento em moeda estrangeira', () => {
  it('assume real quando a moeda não é informada', () => {
    // Todo lançamento que já existia continua valendo sem mudança nenhuma.
    const parsed = newPositionSchema.parse(BASE)
    expect(parsed.entryCurrency).toBe('BRL')
  })

  it('aceita cotação com vírgula e casas decimais', () => {
    const parsed = newPositionSchema.parse({
      ...BASE,
      entryCurrency: 'USD',
      entryRate: '5,0812',
    })

    expect(parsed.entryRate).toBe('5.0812')
  })

  it('recusa cotação zerada ou inválida', () => {
    for (const taxa of ['0', '-1', 'abc', '']) {
      const resultado = newPositionSchema.safeParse({
        ...BASE,
        entryCurrency: 'USD',
        entryRate: taxa,
      })

      expect(resultado.success, `taxa "${taxa}"`).toBe(false)
    }
  })

  it('converte o custo pelo câmbio da compra', () => {
    const parsed = newPositionSchema.parse({
      ...BASE,
      unitCost: '200,00',
      entryCurrency: 'USD',
      entryRate: '5,00',
    })

    const custo = convertMoney(money(parsed.unitCost), parsed.entryCurrency, 'BRL', money(5))

    expect(custo.toString()).toBe('1000')
  })

  it('o valor original em dólar é recuperável a partir do gravado', () => {
    // A garantia que justifica converter na gravação: `unit_price / fx_rate`
    // devolve exatamente o que o usuário digitou, sem perda.
    const digitado = money('200.00')
    const taxa = money('5.0812')

    const gravado = convertMoney(digitado, 'USD', 'BRL', taxa)

    expect(gravado.dividedBy(taxa).toString()).toBe(digitado.toString())
  })
})
