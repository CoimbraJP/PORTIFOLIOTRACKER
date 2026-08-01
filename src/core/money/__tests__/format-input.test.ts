import { describe, expect, it } from 'vitest'
import { formatDecimalInput, parseDecimalInput } from '../parse'

describe('formatDecimalInput', () => {
  it('agrupa milhares para o número ficar legível', () => {
    // O ponto da funcionalidade: 65000 e 650000 são indistinguíveis de relance.
    expect(formatDecimalInput('65000')).toBe('65.000')
    expect(formatDecimalInput('650000')).toBe('650.000')
    expect(formatDecimalInput('1234567')).toBe('1.234.567')
  })

  it('preserva as casas decimais que a pessoa digitou', () => {
    expect(formatDecimalInput('5,08')).toBe('5,08')
    expect(formatDecimalInput('5.0800')).toBe('5,0800')
    expect(formatDecimalInput('1234,56')).toBe('1.234,56')
  })

  it('formatar e reinterpretar devolve o mesmo número', () => {
    // A garantia que importa: o texto que aparece na tela precisa significar
    // exatamente o que vai ser gravado.
    for (const entrada of ['65000', '5,08', '5.0800', '1234567,89', '0,00001234']) {
      const formatado = formatDecimalInput(entrada)
      expect(parseDecimalInput(formatado), entrada).toBe(parseDecimalInput(entrada))
    }
  })

  it('não mexe em texto que ainda não é número', () => {
    // Apagar o que a pessoa escreveu no meio da digitação seria pior do que
    // não formatar.
    expect(formatDecimalInput('')).toBe('')
    expect(formatDecimalInput('12,')).toBe('12,')
    expect(formatDecimalInput('abc')).toBe('abc')
  })

  it('valores grandes não perdem precisão', () => {
    // Agrupar por regex, e não convertendo para número, é o que garante isto.
    expect(formatDecimalInput('9007199254740993')).toBe('9.007.199.254.740.993')
  })
})
