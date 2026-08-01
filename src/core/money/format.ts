import { toNumber, type Money } from './decimal'

export type CurrencyCode = 'BRL' | 'USD' | 'EUR'

/**
 * Aceita `Money` (domínio) ou `number` (fronteira de apresentação: gráfico,
 * contador animado). Formatar é sempre a última etapa — nunca há cálculo aqui.
 */
export type Formattable = Money | number

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  EUR: 'de-DE',
}

function num(value: Formattable): number {
  return typeof value === 'number' ? value : toNumber(value)
}

/** R$ 1.284.930,00 */
export function formatMoney(
  value: Formattable,
  currency: CurrencyCode = 'BRL',
  options?: { compact?: boolean; hideSymbol?: boolean },
): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: options?.hideSymbol ? 'decimal' : 'currency',
    currency,
    notation: options?.compact ? 'compact' : 'standard',
    minimumFractionDigits: options?.compact ? 0 : 2,
    maximumFractionDigits: options?.compact ? 1 : 2,
  }).format(num(value))
}

/** +12,40% — com sinal explícito, porque a direção é a informação. */
export function formatPercent(value: Formattable, fractionDigits = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    signDisplay: 'exceptZero',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num(value) / 100)
}

/** 12,4% — sem sinal. Para participação no patrimônio, onde não há direção. */
export function formatShare(value: Formattable, fractionDigits = 1): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num(value) / 100)
}

/** 0,00042135 BTC ou 1.200 ações — sem casas decimais inúteis. */
export function formatQuantity(value: Formattable, maxFractionDigits = 8): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(num(value))
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

export function formatMonthShort(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(iso))
    .replace('.', '')
}
