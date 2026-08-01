import { describe, expect, it } from 'vitest'
import { toPriceString } from '../types'

/**
 * Este guarda existe por causa de um bug real: a BRAPI devolveu um resultado
 * sem `regularMarketPrice`, o código checava só `=== null`, e `String(undefined)`
 * mandou o texto `"undefined"` para uma coluna `numeric` — derrubando a
 * sincronização inteira, não só aquele ticker.
 */
describe('toPriceString', () => {
  it('aceita número e string numérica', () => {
    expect(toPriceString(42.5)).toBe('42.5')
    expect(toPriceString('42.5')).toBe('42.5')
  })

  it('recusa ausência de valor', () => {
    expect(toPriceString(undefined)).toBeNull()
    expect(toPriceString(null)).toBeNull()
    expect(toPriceString('')).toBeNull()
  })

  it('recusa valor que não é número', () => {
    expect(toPriceString(Number.NaN)).toBeNull()
    expect(toPriceString('N/A')).toBeNull()
    expect(toPriceString({})).toBeNull()
    expect(toPriceString(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('recusa zero e negativo: é dado faltando, não preço', () => {
    // Gravar zero zeraria a posição no dashboard como se o ativo tivesse
    // virado pó — pior do que exibir "sem cotação".
    expect(toPriceString(0)).toBeNull()
    expect(toPriceString('0')).toBeNull()
    expect(toPriceString(-1)).toBeNull()
  })

  it('preserva a precisão que a API mandou', () => {
    // Cripto de preço baixo tem muitas casas; arredondar aqui distorceria o
    // patrimônio de quem tem milhões de unidades.
    expect(toPriceString(0.00001234)).toBe('0.00001234')
  })
})
