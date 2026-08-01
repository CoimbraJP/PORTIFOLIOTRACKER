import { describe, expect, it } from 'vitest'
import { parseDecimalInput } from '../parse'

/**
 * O teste que existe por causa de um prejuízo real.
 *
 * A cotação do dólar pré-preenchida como "5.0800" era lida como 50800, e um
 * aporte de US$ 65 mil foi gravado como R$ 3,3 bilhões — 625 vezes maior.
 */
describe('parseDecimalInput', () => {
  it('vírgula é decimal, ponto é milhar', () => {
    expect(parseDecimalInput('1.250,40')).toBe('1250.40')
    expect(parseDecimalInput('3.301.506,99')).toBe('3301506.99')
    expect(parseDecimalInput('5,0800')).toBe('5.0800')
  })

  it('ponto seguido de mais de três casas é DECIMAL, não milhar', () => {
    // O caso do bug: "5.0800" tem quatro casas depois do ponto, logo não pode
    // ser separador de milhar.
    expect(parseDecimalInput('5.0800')).toBe('5.0800')
    expect(parseDecimalInput('5.08')).toBe('5.08')
    expect(parseDecimalInput('65000.5')).toBe('65000.5')
  })

  it('ponto separando grupos de exatamente três é milhar', () => {
    expect(parseDecimalInput('1.250')).toBe('1250')
    expect(parseDecimalInput('1.250.000')).toBe('1250000')
  })

  it('número simples passa intacto', () => {
    expect(parseDecimalInput('65000')).toBe('65000')
    expect(parseDecimalInput('  42  ')).toBe('42')
    expect(parseDecimalInput('')).toBe('')
  })

  it('o câmbio pré-preenchido pelo servidor sobrevive à ida e volta', () => {
    // Contrato entre a consulta, que formata, e o formulário, que lê.
    const doServidor = (5.08).toFixed(4).replace('.', ',')

    expect(doServidor).toBe('5,0800')
    expect(Number(parseDecimalInput(doServidor))).toBe(5.08)
  })
})
