import type { AssetClassSlug, WalletKind } from '../types/portfolio'
import type {
  ChangeView,
  ConsolidatedInstrumentView,
  HistoryPointView,
  MoneyView,
  PositionView,
} from './portfolio-view'
import type { Term } from '@/config/asset-classes'
import type { ValuationLabels } from '@/config/valuation-labels'

/**
 * View model da tela de classe, num módulo SEM efeito colateral.
 *
 * Estes tipos atravessam a fronteira servidor→cliente como props. Se eles
 * morassem junto da consulta — que importa `server-only`, Drizzle e o driver do
 * Postgres — qualquer componente de cliente que importasse um tipo daqui
 * arrastaria o banco inteiro para o bundle do browser. O build falha, e com
 * razão.
 *
 * `OVERVIEW_SCOPE` mora aqui pelo mesmo motivo: é um valor, não só um tipo, e
 * o cliente precisa dele.
 */
export const OVERVIEW_SCOPE = 'overview'

export interface PerformerView {
  symbol: string
  name: string
  change: ChangeView
}

export interface ScopeSummary {
  currentValue: MoneyView
  totalCost: MoneyView
  income: MoneyView
  profit: MoneyView
  change: ChangeView
  positionsCount: number
  walletCount: number
  /** Participação: da classe no patrimônio, ou da carteira na classe. */
  shareText: string
  shareRaw: number
  best: PerformerView | null
  worst: PerformerView | null
}

export interface WalletDetailView {
  id: string
  name: string
  kind: WalletKind
  positionsCount: number
  currentValue: MoneyView
  totalCost: MoneyView
  income: MoneyView
  profit: MoneyView
  change: ChangeView
  shareText: string
  shareRaw: number
  positions: PositionView[]
}

/** Um recorte da classe: a visão consolidada ou uma carteira isolada. */
export interface ClassScopeView {
  id: string
  label: string
  kind: WalletKind | null
  isOverview: boolean
  summary: ScopeSummary
  consolidated: ConsolidatedInstrumentView[]
  history: HistoryPointView[]
  /** Na visão geral: todas as carteiras. Num recorte de carteira: só ela. */
  wallets: WalletDetailView[]
}

export interface ClassWorkspaceView {
  slug: AssetClassSlug
  name: string
  walletTerm: Term
  assetTerm: Term
  labels: ValuationLabels
  supportsDividends: boolean
  /** O primeiro é sempre a visão geral. */
  scopes: ClassScopeView[]
  walletOptions: { id: string; name: string }[]
  /** Se o formulário oferece lançar em dólar. Ver `foreignEntry` na classe. */
  foreignEntry: boolean
  /**
   * Se esta classe tem tickers catalogados.
   *
   * Imóvel e empresa não têm — o "código" ali é um apelido que o usuário
   * inventa, e sugerir alguma coisa seria absurdo. Sem catálogo, o campo volta
   * a ser texto livre e nada é conferido.
   */
  hasCatalog: boolean
  /**
   * Cotação do dólar para pré-preencher o formulário, como texto.
   *
   * Nula quando o câmbio nunca sincronizou — nesse caso o campo aparece vazio e
   * o usuário digita. Melhor pedir do que converter por um palpite.
   */
  usdBrl: string | null
  /** Ativos sem cotação: a tela avisa em vez de fingir lucro zero. */
  missingQuotes: string[]
}
