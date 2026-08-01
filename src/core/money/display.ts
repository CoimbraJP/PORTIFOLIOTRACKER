import { money, type Money } from './decimal'
import type { CurrencyCode } from './format'
import type { AssetClassSlug } from '../types/portfolio'

export type ClassOverrides = Partial<Record<AssetClassSlug, CurrencyCode>>

export interface DisplaySettings {
  /** Moeda em que o PATRIMÔNIO é somado. O domínio inteiro vive nela. */
  base: CurrencyCode
  /**
   * Moeda de exibição por classe. Ausente = segue a base.
   *
   * Cada estratégia tem sua régua: cripto e stocks quase sempre são cotados em
   * dólar, e quem tem imóvel no exterior pensa naquele bem em dólar também.
   * Isso NÃO muda soma alguma — o patrimônio continua na moeda base, com tudo
   * convertido de volta.
   */
  classOverrides: ClassOverrides
  /** Quantos reais vale 1 dólar. Nulo quando o câmbio ainda não sincronizou. */
  usdBrl: Money | null
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  base: 'BRL',
  classOverrides: {},
  usdBrl: null,
}

/** A outra moeda possível — é para ela que o seletor de cada classe alterna. */
export function alternateCurrency(base: CurrencyCode): CurrencyCode {
  return base === 'BRL' ? 'USD' : 'BRL'
}

/**
 * Em que moeda os valores desta classe devem APARECER.
 *
 * Vale para a linha do ativo e também para os agregados da própria classe —
 * uma classe é homogênea, então o total dela numa moeda só é inequívoco. O que
 * nunca converte é o patrimônio geral, porque ele mistura classes.
 */
export function currencyFor(slug: AssetClassSlug, display: DisplaySettings): CurrencyCode {
  return display.classOverrides[slug] ?? display.base
}

/** Se esta classe está exibida em moeda diferente da base. */
export function isOverridden(slug: AssetClassSlug, display: DisplaySettings): boolean {
  return currencyFor(slug, display) !== display.base
}

/**
 * Converte entre BRL e USD.
 *
 * Sem câmbio conhecido devolve o valor original: o número aparece na moeda
 * errada, mas nenhum patrimônio é multiplicado por um palpite. Inventar uma
 * taxa seria pior do que exibir sem converter.
 */
export function convertMoney(
  value: Money,
  from: CurrencyCode,
  to: CurrencyCode,
  usdBrl: Money | null,
): Money {
  if (from === to) return value
  if (!usdBrl || usdBrl.isZero()) return value

  if (from === 'BRL' && to === 'USD') return value.dividedBy(usdBrl)
  if (from === 'USD' && to === 'BRL') return value.times(usdBrl)

  return value
}

/** Converte um número cru — para séries de gráfico já materializadas. */
export function convertNumber(
  value: number,
  from: CurrencyCode,
  to: CurrencyCode,
  usdBrl: Money | null,
): number {
  return convertMoney(money(value), from, to, usdBrl).toNumber()
}
