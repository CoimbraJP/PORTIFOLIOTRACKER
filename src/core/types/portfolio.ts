import type { ConsolidatedInstrument } from '../consolidation/by-instrument'
import type { Money } from '../money/decimal'
import type { DisplaySettings } from '../money/display'
import type { CurrencyCode } from '../money/format'

/** Como o valor atual de um ativo é obtido. Ver docs/00 §3.3. */
export type ValuationMode = 'QUANTITATIVE' | 'VALUATED' | 'ACCRUAL'

export type AssetClassSlug =
  | 'acoes-br'
  | 'stocks'
  | 'fiis'
  | 'etfs'
  | 'etfs-int'
  | 'cripto'
  | 'renda-fixa'
  | 'imoveis'
  | 'emprestimos'
  | 'alternativos'
  | 'empresas'
  | 'outros'

export type WalletKind = 'BROKER' | 'EXCHANGE' | 'SELF_CUSTODY' | 'BANK' | 'OTHER'

/**
 * Natureza do próprio instrumento, independente de onde ele está guardado.
 *
 * Existe separada da classe da carteira de propósito: a classe diz onde o ativo
 * foi arquivado, o `kind` diz o que ele é. Quando os dois discordam — um CDB
 * numa carteira de ações — quem manda é o `kind`.
 */
export type InstrumentKind = 'STOCK' | 'FII' | 'ETF' | 'CRYPTO' | 'FIXED_INCOME' | 'CUSTOM'

/**
 * Estado de uma posição, sempre DERIVADO do ledger.
 * Nada no sistema escreve estes campos diretamente. Ver CLAUDE.md §2.1.
 */
export interface PositionState {
  quantity: Money
  avgPrice: Money
  totalCost: Money
  realizedPnl: Money
  incomeTotal: Money
}

export interface Position extends PositionState {
  id: string
  symbol: string
  name: string
  walletId: string
  walletName: string
  classSlug: AssetClassSlug
  valuationMode: ValuationMode
  currency: CurrencyCode
  /**
   * Logo do instrumento, sincronizado do provider. Nulo é estado normal, não
   * erro: imóveis, empréstimos e empresas não têm marca.
   */
  logoUrl: string | null
  /** Preço unitário atual. Em modo VALUATED, é a última reavaliação. */
  currentPrice: Money
  /** Valor de mercado na moeda base do tenant. */
  currentValue: Money
}

export interface ClassSummary {
  slug: AssetClassSlug
  name: string
  positionsCount: number
  currentValue: Money
  totalCost: Money
  incomeTotal: Money
  /** currentValue − totalCost + incomeTotal */
  profit: Money
  /** profit / totalCost, em pontos percentuais */
  changePct: Money
  /** participação no patrimônio total, em pontos percentuais */
  share: Money
}

export interface WalletSummary {
  id: string
  name: string
  kind: WalletKind
  classSlug: AssetClassSlug
  positionsCount: number
  currentValue: Money
  totalCost: Money
  profit: Money
  changePct: Money
  share: Money
}

/** Um ponto de `portfolio_snapshot`. Ver docs/00 §3.5. */
export interface SnapshotPoint {
  date: string
  totalValue: Money
  totalCost: Money
}

export interface PortfolioSummary {
  baseCurrency: CurrencyCode
  /**
   * Preferências de exibição. Todo valor do domínio já está na moeda BASE —
   * isto só diz como mostrá-lo. Ver `core/money/display.ts`.
   */
  display: DisplaySettings
  totalValue: Money
  totalCost: Money
  totalIncome: Money
  profit: Money
  changePct: Money
  /** variação do patrimônio no período exibido, em pontos percentuais */
  periodChangePct: Money
  periodChangeValue: Money
  classes: ClassSummary[]
  wallets: WalletSummary[]
  positions: Position[]
  /** O mesmo ativo somado entre carteiras. Ver docs/00 §3.2. */
  consolidated: ConsolidatedInstrument[]
  history: SnapshotPoint[]
}
