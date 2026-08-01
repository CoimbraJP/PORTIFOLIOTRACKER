/**
 * Ponto único de contato com decimal.js.
 *
 * REGRA: nenhum outro arquivo do projeto importa 'decimal.js'.
 * `float` nunca toca dinheiro — ver CLAUDE.md §2.2.
 */
import Decimal from 'decimal.js'

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -18,
  toExpPos: 28,
})

export type Money = Decimal
export type MoneyInput = string | number | Decimal

/** Cria um valor monetário. Prefira string para não perder precisão na origem. */
export function money(value: MoneyInput = 0): Money {
  return new Decimal(value)
}

export const ZERO: Money = new Decimal(0)

export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(v), new Decimal(0))
}

/**
 * Divisão segura: divisor zero devolve zero em vez de estourar.
 * Usado em preço médio e percentuais, onde denominador zerado é estado válido
 * (posição zerada, carteira vazia) e não erro.
 */
export function divide(a: Money, b: Money): Money {
  if (b.isZero()) return new Decimal(0)
  return a.dividedBy(b)
}

/** Variação percentual de `from` para `to`, em pontos percentuais (12.4 = 12,4%). */
export function pctChange(from: Money, to: Money): Money {
  if (from.isZero()) return new Decimal(0)
  return to.minus(from).dividedBy(from).times(100)
}

/** Participação de `part` no `total`, em pontos percentuais. */
export function share(part: Money, total: Money): Money {
  if (total.isZero()) return new Decimal(0)
  return part.dividedBy(total).times(100)
}

/**
 * Converte para `number` na FRONTEIRA de apresentação (gráficos, animação).
 * Nunca use o resultado disto para calcular dinheiro.
 */
export function toNumber(value: Money): number {
  return value.toNumber()
}
