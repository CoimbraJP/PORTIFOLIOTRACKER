import { describe, expect, it } from 'vitest'
import { money } from '../decimal'
import {
  alternateCurrency,
  convertMoney,
  currencyFor,
  isOverridden,
  type DisplaySettings,
} from '../display'

const USD_BRL = money('5.4321')

const brl: DisplaySettings = { base: 'BRL', classOverrides: {}, usdBrl: USD_BRL }

describe('convertMoney', () => {
  it('não mexe quando a moeda é a mesma', () => {
    expect(convertMoney(money(100), 'BRL', 'BRL', USD_BRL).toString()).toBe('100')
  })

  it('converte BRL para USD dividindo pela taxa', () => {
    expect(convertMoney(money('543.21'), 'BRL', 'USD', USD_BRL).toFixed(2)).toBe('100.00')
  })

  it('converte USD para BRL multiplicando pela taxa', () => {
    expect(convertMoney(money(100), 'USD', 'BRL', USD_BRL).toFixed(2)).toBe('543.21')
  })

  it('ida e volta preserva o valor', () => {
    const original = money('1422189.37')
    const emDolar = convertMoney(original, 'BRL', 'USD', USD_BRL)
    const devolta = convertMoney(emDolar, 'USD', 'BRL', USD_BRL)

    expect(devolta.toFixed(2)).toBe(original.toFixed(2))
  })

  it('sem câmbio devolve o valor original em vez de inventar taxa', () => {
    expect(convertMoney(money(100), 'BRL', 'USD', null).toString()).toBe('100')
  })

  it('taxa zero não vira divisão por zero', () => {
    expect(convertMoney(money(100), 'BRL', 'USD', money(0)).toString()).toBe('100')
  })
})

describe('currencyFor — override por classe', () => {
  it('sem override, tudo segue a base', () => {
    expect(currencyFor('cripto', brl)).toBe('BRL')
    expect(currencyFor('stocks', brl)).toBe('BRL')
    expect(currencyFor('imoveis', brl)).toBe('BRL')
  })

  it('cada classe é independente das outras', () => {
    const settings: DisplaySettings = {
      ...brl,
      classOverrides: { cripto: 'USD', stocks: 'USD' },
    }

    expect(currencyFor('cripto', settings)).toBe('USD')
    expect(currencyFor('stocks', settings)).toBe('USD')
    // As não marcadas continuam na base — inclusive as parecidas.
    expect(currencyFor('acoes-br', settings)).toBe('BRL')
    expect(currencyFor('etfs-int', settings)).toBe('BRL')
    expect(currencyFor('imoveis', settings)).toBe('BRL')
  })

  it('imóvel no exterior em dólar, imóvel daqui em real', () => {
    // O caso que motivou generalizar: a régua é por classe, não por tipo.
    const settings: DisplaySettings = { ...brl, classOverrides: { imoveis: 'USD' } }

    expect(currencyFor('imoveis', settings)).toBe('USD')
    expect(currencyFor('cripto', settings)).toBe('BRL')
  })

  it('base USD com uma classe em real inverte o caso', () => {
    const settings: DisplaySettings = {
      base: 'USD',
      classOverrides: { 'acoes-br': 'BRL' },
      usdBrl: USD_BRL,
    }

    expect(currencyFor('acoes-br', settings)).toBe('BRL')
    expect(currencyFor('cripto', settings)).toBe('USD')
  })
})

describe('isOverridden e alternateCurrency', () => {
  it('detecta quando a classe foge da base', () => {
    const settings: DisplaySettings = { ...brl, classOverrides: { cripto: 'USD' } }

    expect(isOverridden('cripto', settings)).toBe(true)
    expect(isOverridden('stocks', settings)).toBe(false)
  })

  it('a alternativa é sempre a outra moeda', () => {
    expect(alternateCurrency('BRL')).toBe('USD')
    expect(alternateCurrency('USD')).toBe('BRL')
  })
})

describe('a rentabilidade percentual não muda com a moeda', () => {
  it('valor e custo convertidos pela mesma taxa preservam a variação', () => {
    const valor = money('165550')
    const custo = money('79050')

    const variacaoBrl = valor.minus(custo).dividedBy(custo).times(100)

    const valorUsd = convertMoney(valor, 'BRL', 'USD', USD_BRL)
    const custoUsd = convertMoney(custo, 'BRL', 'USD', USD_BRL)
    const variacaoUsd = valorUsd.minus(custoUsd).dividedBy(custoUsd).times(100)

    expect(variacaoUsd.toFixed(6)).toBe(variacaoBrl.toFixed(6))
  })
})

describe('o patrimônio total ignora os overrides', () => {
  it('somar classes em moedas diferentes usa sempre a base', () => {
    // O domínio inteiro vive na base; o override é só apresentação. Por isso a
    // soma nunca é afetada, independentemente de quantas classes estão ligadas.
    const cripto = money('294400')
    const acoes = money('132628')
    const settings: DisplaySettings = {
      ...brl,
      classOverrides: { cripto: 'USD', stocks: 'USD', imoveis: 'USD' },
    }

    const total = cripto.plus(acoes)
    const exibidoCripto = convertMoney(cripto, settings.base, currencyFor('cripto', settings), USD_BRL)

    // A linha de cripto muda de cara…
    expect(exibidoCripto.toFixed(2)).not.toBe(cripto.toFixed(2))
    // …mas o total continua sendo a soma em moeda base.
    expect(total.toFixed(2)).toBe('427028.00')
  })
})
