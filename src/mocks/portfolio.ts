/**
 * Dados de demonstração da Fase 1.
 *
 * Produzem exatamente os tipos de domínio de `core/types/portfolio.ts`, com
 * `Decimal` de ponta a ponta. Na Fase 3 este módulo é substituído por
 * `server/queries/dashboard.ts` — nenhum componente precisa mudar.
 *
 * Determinístico de propósito: o servidor e o cliente precisam renderizar a
 * mesma série, senão a hidratação quebra.
 */
import { consolidateByClass } from '@/core/consolidation/by-class'
import { consolidateByWallet, type WalletMeta } from '@/core/consolidation/by-wallet'
import { consolidateByInstrument } from '@/core/consolidation/by-instrument'
import { divide, money, pctChange, sum, type Money } from '@/core/money/decimal'
import { DEFAULT_DISPLAY } from '@/core/money/display'
import { ASSET_CLASSES } from '@/config/asset-classes'
import type {
  AssetClassSlug,
  PortfolioSummary,
  Position,
  SnapshotPoint,
  ValuationMode,
} from '@/core/types/portfolio'

export const MOCK_WALLETS: readonly WalletMeta[] = [
  { id: 'w-xp', name: 'XP', kind: 'BROKER' },
  { id: 'w-inter', name: 'Inter', kind: 'BROKER' },
  { id: 'w-avenue', name: 'Avenue', kind: 'BROKER' },
  { id: 'w-binance', name: 'Binance', kind: 'EXCHANGE' },
  { id: 'w-ledger', name: 'Ledger', kind: 'SELF_CUSTODY' },
  { id: 'w-metamask', name: 'Metamask', kind: 'SELF_CUSTODY' },
  { id: 'w-imoveis', name: 'Imóveis próprios', kind: 'OTHER' },
  { id: 'w-pessoal', name: 'Crédito pessoal', kind: 'OTHER' },
  { id: 'w-holding', name: 'Holding', kind: 'OTHER' },
]

const WALLET_NAME = new Map(MOCK_WALLETS.map((w) => [w.id, w.name]))

export interface RawPosition {
  id: string
  symbol: string
  name: string
  walletId: string
  classSlug: AssetClassSlug
  valuationMode: ValuationMode
  quantity: string
  avgPrice: string
  currentPrice: string
  income?: string
  realized?: string
  /**
   * Nulo em toda a demonstração — e de propósito.
   *
   * O logo real é responsabilidade do provider (Fase 4): CoinGecko devolve
   * `image.large`, a BRAPI devolve `logourl`. Fixar URLs à mão aqui criaria
   * imagens quebradas no dia em que qualquer CDN mudasse de caminho, e o dado
   * ficaria preso no mock em vez de vir da sincronização.
   * Ver `integrations/providers/logo.ts`.
   */
  logoUrl?: string | null
}

export const DEMO_POSITIONS: readonly RawPosition[] = [
  // --- Ações Brasil -------------------------------------------------------
  { id: 'p-bbas3', symbol: 'BBAS3', name: 'Banco do Brasil', walletId: 'w-xp', classSlug: 'acoes-br', valuationMode: 'QUANTITATIVE', quantity: '1200', avgPrice: '24.80', currentPrice: '28.45', income: '4820' },
  { id: 'p-vale3', symbol: 'VALE3', name: 'Vale', walletId: 'w-xp', classSlug: 'acoes-br', valuationMode: 'QUANTITATIVE', quantity: '600', avgPrice: '62.30', currentPrice: '58.90', income: '3960' },
  { id: 'p-itsa4', symbol: 'ITSA4', name: 'Itaúsa', walletId: 'w-xp', classSlug: 'acoes-br', valuationMode: 'QUANTITATIVE', quantity: '2500', avgPrice: '9.15', currentPrice: '11.32', income: '2140' },
  { id: 'p-petr4', symbol: 'PETR4', name: 'Petrobras', walletId: 'w-inter', classSlug: 'acoes-br', valuationMode: 'QUANTITATIVE', quantity: '900', avgPrice: '33.50', currentPrice: '38.72', income: '6380' },

  // --- FIIs ---------------------------------------------------------------
  { id: 'p-mxrf11', symbol: 'MXRF11', name: 'Maxi Renda', walletId: 'w-xp', classSlug: 'fiis', valuationMode: 'QUANTITATIVE', quantity: '3000', avgPrice: '10.15', currentPrice: '10.48', income: '2860' },
  { id: 'p-hglg11', symbol: 'HGLG11', name: 'CSHG Logística', walletId: 'w-xp', classSlug: 'fiis', valuationMode: 'QUANTITATIVE', quantity: '180', avgPrice: '158.40', currentPrice: '164.20', income: '2210' },

  // --- Stocks (valores já convertidos para a moeda base) ------------------
  { id: 'p-aapl', symbol: 'AAPL', name: 'Apple', walletId: 'w-avenue', classSlug: 'stocks', valuationMode: 'QUANTITATIVE', quantity: '45', avgPrice: '1120.00', currentPrice: '1385.00', income: '620' },
  { id: 'p-msft', symbol: 'MSFT', name: 'Microsoft', walletId: 'w-avenue', classSlug: 'stocks', valuationMode: 'QUANTITATIVE', quantity: '22', avgPrice: '1980.00', currentPrice: '2340.00', income: '410' },

  // --- ETFs Internacionais ------------------------------------------------
  { id: 'p-voo', symbol: 'VOO', name: 'Vanguard S&P 500', walletId: 'w-avenue', classSlug: 'etfs-int', valuationMode: 'QUANTITATIVE', quantity: '38', avgPrice: '2650.00', currentPrice: '3180.00', income: '1980' },

  // --- Criptomoedas — o mesmo ativo em carteiras diferentes ---------------
  { id: 'p-btc-binance', symbol: 'BTC', name: 'Bitcoin', walletId: 'w-binance', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '0.18', avgPrice: '210000', currentPrice: '385000' },
  { id: 'p-btc-ledger', symbol: 'BTC', name: 'Bitcoin', walletId: 'w-ledger', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '0.25', avgPrice: '165000', currentPrice: '385000' },
  { id: 'p-eth-binance', symbol: 'ETH', name: 'Ethereum', walletId: 'w-binance', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '1.6', avgPrice: '12800', currentPrice: '19400' },
  { id: 'p-eth-ledger', symbol: 'ETH', name: 'Ethereum', walletId: 'w-ledger', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '1', avgPrice: '9500', currentPrice: '19400' },
  { id: 'p-sol', symbol: 'SOL', name: 'Solana', walletId: 'w-binance', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '20', avgPrice: '720', currentPrice: '1180' },
  { id: 'p-ondo', symbol: 'ONDO', name: 'Ondo Finance', walletId: 'w-metamask', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '5000', avgPrice: '4.10', currentPrice: '5.85' },
  { id: 'p-pendle', symbol: 'PENDLE', name: 'Pendle', walletId: 'w-metamask', classSlug: 'cripto', valuationMode: 'QUANTITATIVE', quantity: '1200', avgPrice: '18.40', currentPrice: '21.30' },

  // --- Renda Fixa — modo ACCRUAL -----------------------------------------
  { id: 'p-cdb-inter', symbol: 'CDB INTER 118% CDI', name: 'CDB Inter 118% CDI', walletId: 'w-inter', classSlug: 'renda-fixa', valuationMode: 'ACCRUAL', quantity: '1', avgPrice: '80000', currentPrice: '94320' },

  // --- Imóveis — modo VALUATED -------------------------------------------
  { id: 'p-apto', symbol: 'APTO-PINHEIROS', name: 'Apartamento — Pinheiros, SP', walletId: 'w-imoveis', classSlug: 'imoveis', valuationMode: 'VALUATED', quantity: '1', avgPrice: '380000', currentPrice: '465000', income: '28800' },

  // --- Empréstimos a juros — o usuário é o CREDOR ------------------------
  { id: 'p-emp-ricardo', symbol: 'EMP-RICARDO', name: 'Empréstimo — Ricardo M.', walletId: 'w-pessoal', classSlug: 'emprestimos', valuationMode: 'ACCRUAL', quantity: '1', avgPrice: '45000', currentPrice: '52200', income: '7200' },

  // --- Empresas — modo VALUATED ------------------------------------------
  { id: 'p-holding', symbol: 'PART-COMERCIO', name: 'Participação — Comércio Ltda.', walletId: 'w-holding', classSlug: 'empresas', valuationMode: 'VALUATED', quantity: '1', avgPrice: '60000', currentPrice: '88000' },
]

export function buildMockPositions(): Position[] {
  return DEMO_POSITIONS.map((raw) => {
    const quantity = money(raw.quantity)
    const avgPrice = money(raw.avgPrice)
    const currentPrice = money(raw.currentPrice)

    return {
      id: raw.id,
      symbol: raw.symbol,
      name: raw.name,
      walletId: raw.walletId,
      walletName: WALLET_NAME.get(raw.walletId) ?? '—',
      classSlug: raw.classSlug,
      valuationMode: raw.valuationMode,
      currency: 'BRL' as const,
      logoUrl: raw.logoUrl ?? null,
      quantity,
      avgPrice,
      totalCost: quantity.times(avgPrice),
      totalInvested: quantity.times(avgPrice),
      currentPrice,
      currentValue: quantity.times(currentPrice),
      realizedPnl: money(raw.realized ?? 0),
      incomeTotal: money(raw.income ?? 0),
    }
  })
}

/* -------------------------------------------------------------------------- *
 * Série histórica determinística
 * -------------------------------------------------------------------------- */

/** LCG simples. Mesma semente, mesma série — servidor e cliente batem. */
function seededNoise(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** Semente estável a partir de um texto — cada classe ganha sua própria série. */
function seedFrom(key: string): number {
  let hash = 2026
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 4294967296
  return hash
}

export function buildHistory(
  finalValue: Money,
  finalCost: Money,
  seedKey = 'patrimonio',
  days = 240,
): SnapshotPoint[] {
  const noise = seededNoise(seedFrom(seedKey))
  const points: SnapshotPoint[] = []

  const startValue = finalValue.times(0.61)
  const startCost = finalCost.times(0.72)
  const today = new Date(Date.UTC(2026, 6, 29))

  let drift = 0

  for (let i = days; i >= 0; i--) {
    const t = (days - i) / days
    const date = new Date(today)
    date.setUTCDate(date.getUTCDate() - i)

    // Passeio aleatório com reversão à média, para parecer mercado e não seno.
    drift = drift * 0.92 + (noise() - 0.5) * 0.028
    const trend = t * t * (3 - 2 * t) // suavização cúbica
    const factor = 1 + drift

    const value = startValue.plus(finalValue.minus(startValue).times(trend)).times(factor)
    const cost = startCost.plus(finalCost.minus(startCost).times(t))

    points.push({
      date: date.toISOString().slice(0, 10),
      totalValue: value,
      totalCost: cost,
    })
  }

  // O último ponto é o "hoje" real, calculado ao vivo — nunca ruído.
  points[points.length - 1] = {
    date: today.toISOString().slice(0, 10),
    totalValue: finalValue,
    totalCost: finalCost,
  }

  return points
}

/* -------------------------------------------------------------------------- */

export const CLASS_NAMES = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c.slug, c.name]),
) as Record<AssetClassSlug, string>

export function getMockPortfolio(): PortfolioSummary {
  const positions = buildMockPositions()

  const totalValue = sum(positions.map((p) => p.currentValue))
  const totalCost = sum(positions.map((p) => p.totalCost))
  const totalIncome = sum(positions.map((p) => p.incomeTotal))
  const profit = totalValue.minus(totalCost).plus(totalIncome)

  const history = buildHistory(totalValue, totalCost)
  const monthAgo = history[Math.max(0, history.length - 31)]
  const periodBase = monthAgo?.totalValue ?? totalValue

  return {
    baseCurrency: 'BRL',
    display: DEFAULT_DISPLAY,
    totalValue,
    totalCost,
    totalIncome,
    profit,
    changePct: divide(profit, totalCost).times(100),
    periodChangePct: pctChange(periodBase, totalValue),
    periodChangeValue: totalValue.minus(periodBase),
    classes: consolidateByClass(positions, CLASS_NAMES),
    wallets: consolidateByWallet(positions, MOCK_WALLETS),
    positions,
    consolidated: consolidateByInstrument(positions),
    history,
  }
}

