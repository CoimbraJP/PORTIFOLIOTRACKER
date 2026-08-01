/**
 * Fronteira de apresentação.
 *
 * Objetos `Decimal` não atravessam o limite servidor → cliente (não são
 * serializáveis). Aqui o domínio vira view model: strings já formatadas para
 * exibir, e `number` apenas onde gráfico e animação exigem.
 *
 * Depois desta camada, ninguém calcula dinheiro.
 */
import { toNumber, type Money } from '../money/decimal'
import { convertMoney, currencyFor, type DisplaySettings } from '../money/display'
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatShare,
  type CurrencyCode,
} from '../money/format'
import type { ConsolidatedInstrument } from '../consolidation/by-instrument'
import type {
  AssetClassSlug,
  ClassSummary,
  PortfolioSummary,
  Position,
  SnapshotPoint,
  ValuationMode,
  WalletKind,
  WalletSummary,
} from '../types/portfolio'

export interface MoneyView {
  /** "R$ 1.284.930,00" */
  text: string
  /** "R$ 1,3 mi" */
  compact: string
  /** valor cru, só para gráfico e animação */
  raw: number
  /** Em que moeda este valor está sendo exibido. */
  currency: CurrencyCode
}

export interface ChangeView {
  /** "+12,40%" */
  text: string
  raw: number
  direction: 'up' | 'down' | 'flat'
}

export interface PositionView {
  id: string
  symbol: string
  name: string
  walletId: string
  walletName: string
  classSlug: AssetClassSlug
  valuationMode: ValuationMode
  logoUrl: string | null
  quantity: string
  avgPrice: MoneyView
  currentPrice: MoneyView
  currentValue: MoneyView
  totalCost: MoneyView
  income: MoneyView
  profit: MoneyView
  change: ChangeView
}

export interface ClassSummaryView {
  slug: AssetClassSlug
  name: string
  positionsCount: number
  /**
   * Na moeda de EXIBIÇÃO da classe. Uma classe é homogênea — todos os ativos
   * dela compartilham a mesma moeda —, então mostrar o total dela em dólar é
   * inequívoco. Só o patrimônio geral, que mistura classes, fica preso à base.
   */
  currentValue: MoneyView
  /** Sempre na moeda base. É o que alimenta gráfico e somatório. */
  baseValue: MoneyView
  totalCost: MoneyView
  income: MoneyView
  profit: MoneyView
  change: ChangeView
  /** "37,4%" */
  shareText: string
  shareRaw: number
}

export interface WalletSummaryView {
  id: string
  name: string
  kind: WalletKind
  classSlug: AssetClassSlug
  positionsCount: number
  /** Na moeda de exibição da classe a que a carteira pertence. */
  currentValue: MoneyView
  /** Sempre na moeda base. */
  baseValue: MoneyView
  totalCost: MoneyView
  profit: MoneyView
  change: ChangeView
  shareText: string
  shareRaw: number
}

export interface ConsolidatedInstrumentView {
  symbol: string
  name: string
  classSlug: AssetClassSlug
  logoUrl: string | null
  quantity: string
  avgPrice: MoneyView
  currentPrice: MoneyView
  currentValue: MoneyView
  totalCost: MoneyView
  income: MoneyView
  profit: MoneyView
  change: ChangeView
  walletCount: number
  walletNames: string[]
}

export interface HistoryPointView {
  date: string
  value: number
  cost: number
  /** Lucro acumulado no ponto. Calculado aqui para o cliente não somar dinheiro. */
  profit: number
}

export interface PortfolioView {
  baseCurrency: CurrencyCode
  totalValue: MoneyView
  totalCost: MoneyView
  totalIncome: MoneyView
  profit: MoneyView
  change: ChangeView
  periodChange: ChangeView
  periodChangeValue: MoneyView
  classes: ClassSummaryView[]
  wallets: WalletSummaryView[]
  positions: PositionView[]
  consolidated: ConsolidatedInstrumentView[]
  history: HistoryPointView[]
}

/* -------------------------------------------------------------------------- */

export function toMoneyView(value: Money, currency: CurrencyCode): MoneyView {
  return {
    text: formatMoney(value, currency),
    compact: formatMoney(value, currency, { compact: true }),
    raw: toNumber(value),
    currency,
  }
}

/**
 * Valor do domínio (sempre na moeda BASE) convertido para a moeda de exibição
 * daquela classe. Usado só nas linhas de ativo — agregado nenhum passa por aqui.
 */
function toDisplayView(value: Money, base: CurrencyCode, target: CurrencyCode, display: DisplaySettings): MoneyView {
  return toMoneyView(convertMoney(value, base, target, display.usdBrl), target)
}

export function toChangeView(value: Money): ChangeView {
  const raw = toNumber(value)
  return {
    text: formatPercent(value),
    raw,
    direction: raw > 0 ? 'up' : raw < 0 ? 'down' : 'flat',
  }
}

function toPositionView(p: Position, base: CurrencyCode, display: DisplaySettings): PositionView {
  const profit = p.currentValue.minus(p.totalCost).plus(p.incomeTotal)
  const change = p.totalCost.isZero() ? p.totalCost : profit.dividedBy(p.totalCost).times(100)
  // Cripto pode aparecer em dólar mesmo com a base em real — ver display.ts.
  const currency = currencyFor(p.classSlug, display)
  const view = (v: Money) => toDisplayView(v, base, currency, display)

  return {
    id: p.id,
    symbol: p.symbol,
    name: p.name,
    walletId: p.walletId,
    walletName: p.walletName,
    classSlug: p.classSlug,
    valuationMode: p.valuationMode,
    logoUrl: p.logoUrl,
    quantity: formatQuantity(p.quantity),
    avgPrice: view(p.avgPrice),
    currentPrice: view(p.currentPrice),
    currentValue: view(p.currentValue),
    totalCost: view(p.totalCost),
    income: view(p.incomeTotal),
    profit: view(profit),
    change: toChangeView(change),
  }
}

function toClassView(
  c: ClassSummary,
  base: CurrencyCode,
  display: DisplaySettings,
): ClassSummaryView {
  const currency = currencyFor(c.slug, display)
  const view = (v: Money) => toDisplayView(v, base, currency, display)

  return {
    slug: c.slug,
    name: c.name,
    positionsCount: c.positionsCount,
    currentValue: view(c.currentValue),
    baseValue: toMoneyView(c.currentValue, base),
    totalCost: view(c.totalCost),
    income: view(c.incomeTotal),
    profit: view(c.profit),
    change: toChangeView(c.changePct),
    shareText: formatShare(c.share),
    shareRaw: toNumber(c.share),
  }
}

function toWalletView(
  w: WalletSummary,
  base: CurrencyCode,
  display: DisplaySettings,
): WalletSummaryView {
  const currency = currencyFor(w.classSlug, display)
  const view = (v: Money) => toDisplayView(v, base, currency, display)

  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    classSlug: w.classSlug,
    positionsCount: w.positionsCount,
    currentValue: view(w.currentValue),
    baseValue: toMoneyView(w.currentValue, base),
    totalCost: view(w.totalCost),
    profit: view(w.profit),
    change: toChangeView(w.changePct),
    shareText: formatShare(w.share),
    shareRaw: toNumber(w.share),
  }
}

function toConsolidatedView(
  c: ConsolidatedInstrument,
  base: CurrencyCode,
  display: DisplaySettings,
): ConsolidatedInstrumentView {
  const profit = c.currentValue.minus(c.totalCost).plus(c.incomeTotal)
  const change = c.totalCost.isZero() ? c.totalCost : profit.dividedBy(c.totalCost).times(100)
  const currency = currencyFor(c.classSlug, display)
  const view = (v: Money) => toDisplayView(v, base, currency, display)

  return {
    symbol: c.symbol,
    name: c.name,
    classSlug: c.classSlug,
    logoUrl: c.logoUrl,
    quantity: formatQuantity(c.quantity),
    avgPrice: view(c.avgPrice),
    currentPrice: view(c.currentPrice),
    currentValue: view(c.currentValue),
    totalCost: view(c.totalCost),
    income: view(c.incomeTotal),
    profit: view(profit),
    change: toChangeView(change),
    walletCount: c.walletCount,
    walletNames: c.walletNames,
  }
}

function toHistoryView(p: SnapshotPoint): HistoryPointView {
  return {
    date: p.date,
    value: toNumber(p.totalValue),
    cost: toNumber(p.totalCost),
    profit: toNumber(p.totalValue.minus(p.totalCost)),
  }
}

export function toPortfolioView(summary: PortfolioSummary): PortfolioView {
  const c = summary.baseCurrency
  return {
    baseCurrency: c,
    totalValue: toMoneyView(summary.totalValue, c),
    totalCost: toMoneyView(summary.totalCost, c),
    totalIncome: toMoneyView(summary.totalIncome, c),
    profit: toMoneyView(summary.profit, c),
    change: toChangeView(summary.changePct),
    periodChange: toChangeView(summary.periodChangePct),
    periodChangeValue: toMoneyView(summary.periodChangeValue, c),
    classes: summary.classes.map((x) => toClassView(x, c, summary.display)),
    wallets: summary.wallets.map((x) => toWalletView(x, c, summary.display)),
    positions: summary.positions.map((x) => toPositionView(x, c, summary.display)),
    consolidated: summary.consolidated.map((x) => toConsolidatedView(x, c, summary.display)),
    history: summary.history.map(toHistoryView),
  }
}
