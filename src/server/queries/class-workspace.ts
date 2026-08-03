import 'server-only'

import { asc, eq } from 'drizzle-orm'
import { consolidateByInstrument } from '@/core/consolidation/by-instrument'
import { money, share, sum, type Money } from '@/core/money/decimal'
import { convertMoney, currencyFor, type DisplaySettings } from '@/core/money/display'
import { formatShare, type CurrencyCode } from '@/core/money/format'
import {
  toChangeView,
  toMoneyView,
  toPortfolioView,
  type ConsolidatedInstrumentView,
  type PositionView,
} from '@/core/view/portfolio-view'
import type {
  AssetClassSlug,
  Position,
  SnapshotPoint,
  WalletKind,
} from '@/core/types/portfolio'
import { assetClass } from '@/config/asset-classes'
import { VALUATION_LABELS } from '@/config/valuation-labels'
import {
  OVERVIEW_SCOPE,
  type ClassScopeView,
  type ClassWorkspaceView,
  type PerformerView,
  type ScopeSummary,
  type WalletDetailView,
} from '@/core/view/class-workspace-view'
import { getDb } from '@/db/client'
import { withRls } from '@/db/rls'
import { portfolioSnapshot, tickerCatalog } from '@/db/schema'
import { loadPositions } from './load-positions'
import { loadDisplaySettings } from './display-settings'


/* ------------------------------------------------------------------ tipos --- */

// As definições vivem em `core/view/class-workspace-view.ts`, sem efeito
// colateral, para que componentes de cliente possam importá-las sem arrastar
// o Drizzle e o driver do Postgres para o bundle do browser.
export {
  OVERVIEW_SCOPE,
  type ClassScopeView,
  type ClassWorkspaceView,
  type PerformerView,
  type ScopeSummary,
  type WalletDetailView,
}

/* ---------------------------------------------------------------- consulta --- */

interface SnapshotRow {
  date: string
  totalValue: string
  totalCost: string
  breakdown: { byClass?: Record<string, string>; byWallet?: Record<string, string> } | null
}

/**
 * Área de trabalho de uma classe, sobre o banco.
 *
 * Carrega posições e snapshots UMA vez e monta todos os recortes em memória.
 * Uma consulta por carteira seria o N+1 clássico — com o banco em São Paulo e
 * o servidor em casa, cada round trip extra é visível na tela.
 */
export async function loadClassWorkspace(
  userId: string,
  tenantId: string,
  slug: AssetClassSlug,
): Promise<ClassWorkspaceView> {
  const definition = assetClass(slug)
  const display = await loadDisplaySettings(tenantId)

  // Uma consulta de existência, não a lista: o autocomplete busca sob demanda.
  const [catalogRow] = await getDb()
    .select({ symbol: tickerCatalog.symbol })
    .from(tickerCatalog)
    .where(eq(tickerCatalog.classSlug, slug))
    .limit(1)

  const catalogado = catalogRow !== undefined
  const {
    positions: allPositions,
    wallets: walletMeta,
    missingQuotes,
  } = await loadPositions(userId, tenantId, display)
  const kindByWallet = new Map(walletMeta.map((w) => [w.id, w.kind]))

  const snapshots = (await withRls(userId, (tx) =>
    tx
      .select({
        date: portfolioSnapshot.date,
        totalValue: portfolioSnapshot.totalValue,
        totalCost: portfolioSnapshot.totalCost,
        breakdown: portfolioSnapshot.breakdown,
      })
      .from(portfolioSnapshot)
      .orderBy(asc(portfolioSnapshot.date)),
  )) as SnapshotRow[]

  const portfolioValue = sum(allPositions.map((p) => p.currentValue))
  const positions = allPositions.filter((p) => p.classSlug === slug)
  const classValue = sum(positions.map((p) => p.currentValue))
  const classCost = sum(positions.map((p) => p.totalCost))

  // A página de uma classe é homogênea: todos os ativos dela compartilham a
  // mesma moeda de exibição. Por isso os agregados DESTA tela podem aparecer
  // em dólar — só o patrimônio geral, que mistura classes, fica preso à base.
  const classCurrency = currencyFor(slug, display)
  const toClass = (v: Money) => convertMoney(v, display.base, classCurrency, display.usdBrl)

  const overview = buildScope({
    id: OVERVIEW_SCOPE,
    label: 'Visão geral',
    kind: null,
    isOverview: true,
    positions,
    shareBase: portfolioValue,
    history: seriesFrom(snapshots, 'byClass', slug, toClass(classValue), toClass(classCost), display, slug),
    kindByWallet,
    display,
    currency: classCurrency,
  })

  const walletScopes = overview.wallets.map((wallet) => {
    const walletPositions = positions.filter((p) => p.walletId === wallet.id)
    const value = sum(walletPositions.map((p) => p.currentValue))
    const cost = sum(walletPositions.map((p) => p.totalCost))

    return buildScope({
      id: wallet.id,
      label: wallet.name,
      kind: wallet.kind,
      isOverview: false,
      positions: walletPositions,
      shareBase: classValue,
      history: seriesFrom(snapshots, 'byWallet', wallet.id, toClass(value), toClass(cost), display, slug),
      kindByWallet,
      display,
      currency: classCurrency,
    })
  })

  return {
    slug,
    name: definition.name,
    walletTerm: definition.walletTerm,
    assetTerm: definition.assetTerm,
    labels: VALUATION_LABELS[definition.valuationMode],
    supportsDividends: definition.supportsDividends,
    scopes: [overview, ...walletScopes],
    walletOptions: overview.wallets.map((w) => ({ id: w.id, name: w.name })),
    foreignEntry: definition.foreignEntry,
    hasCatalog: catalogado,
    // Em formato brasileiro: o campo é lido pelo mesmo parser que o usuário
    // alimenta, e mandar "5.0800" para um campo pt-BR foi exatamente o que
    // transformou o câmbio em 50.800.
    usdBrl: display.usdBrl?.toFixed(4).replace('.', ',') ?? null,
    missingQuotes: missingQuotes.filter((symbol) =>
      positions.some((p) => p.symbol === symbol),
    ),
  }
}

/**
 * Série do recorte, lida do `breakdown` do snapshot.
 *
 * A coluna existe exatamente para isso: sem ela, o gráfico de uma carteira
 * teria que ser inventado a partir do total. Snapshot sem breakdown não
 * contribui — some do gráfico em vez de virar um ponto errado.
 *
 * O ponto de hoje é sempre o valor de AGORA: o snapshot do dia só é gravado no
 * fechamento, e até lá o ponto mais visível da curva estaria desatualizado.
 */
function seriesFrom(
  snapshots: SnapshotRow[],
  dimension: 'byClass' | 'byWallet',
  key: string,
  currentValue: Money,
  currentCost: Money,
  display: DisplaySettings,
  slug: AssetClassSlug,
): SnapshotPoint[] {
  const today = new Date().toISOString().slice(0, 10)
  const points: SnapshotPoint[] = []

  for (const row of snapshots) {
    if (row.date === today) continue

    const raw = row.breakdown?.[dimension]?.[key]
    if (raw === undefined) continue

    const total = money(row.totalValue)
    const value = money(raw)
    // O custo do recorte não é gravado; estima-se pela participação do dia.
    // Só afeta a linha tracejada do gráfico.
    const ratio = total.isZero() ? money(0) : value.dividedBy(total)

    // Snapshot é gravado em BRL. A página inteira de uma classe é homogênea,
    // então a série acompanha a moeda de exibição DELA — não a base.
    const target = currencyFor(slug, display)
    const toTarget = (v: Money) => convertMoney(v, 'BRL', target, display.usdBrl)

    points.push({
      date: row.date,
      totalValue: toTarget(value),
      totalCost: toTarget(money(row.totalCost).times(ratio)),
    })
  }

  points.push({ date: today, totalValue: currentValue, totalCost: currentCost })
  return points
}

/* ---------------------------------------------------------------- montagem --- */

function buildScope(options: {
  id: string
  label: string
  kind: WalletKind | null
  isOverview: boolean
  positions: Position[]
  shareBase: Money
  history: SnapshotPoint[]
  kindByWallet: Map<string, WalletKind>
  display: DisplaySettings
  /** Moeda de exibição da classe — vale para todos os agregados desta tela. */
  currency: CurrencyCode
}): ClassScopeView {
  const { positions, shareBase } = options

  const currentValue = sum(positions.map((p) => p.currentValue))
  const totalCost = sum(positions.map((p) => p.totalCost))
  const totalInvested = sum(positions.map((p) => p.totalInvested))
  const income = sum(positions.map((p) => p.incomeTotal))
  const profit = currentValue.minus(totalCost).plus(income)
  const scopeShare = share(currentValue, shareBase)

  // Reaproveita o mapeador de view do domínio para não duplicar formatação.
  const view = toPortfolioView({
    baseCurrency: options.display.base,
    display: options.display,
    totalValue: currentValue,
    totalCost,
    totalIncome: income,
    profit,
    changePct: percentOf(profit, totalCost),
    periodChangePct: money(0),
    periodChangeValue: money(0),
    classes: [],
    wallets: [],
    positions,
    consolidated: consolidateByInstrument(positions),
    history: options.history,
  })

  const { currency, display } = options
  const toDisplay = (v: Money) => convertMoney(v, display.base, currency, display.usdBrl)

  const wallets = buildWalletDetails(
    positions,
    view.positions,
    currentValue,
    options.kindByWallet,
    currency,
    toDisplay,
  )

  return {
    id: options.id,
    label: options.label,
    kind: options.kind,
    isOverview: options.isOverview,
    summary: {
      currentValue: toMoneyView(toDisplay(currentValue), currency),
      totalCost: toMoneyView(toDisplay(totalCost), currency),
      totalInvested: toMoneyView(toDisplay(totalInvested), currency),
      income: toMoneyView(toDisplay(income), currency),
      profit: toMoneyView(toDisplay(profit), currency),
      change: view.change,
      positionsCount: positions.length,
      walletCount: wallets.length,
      shareText: formatShare(scopeShare),
      shareRaw: scopeShare.toNumber(),
      ...rankPerformers(view.consolidated),
    },
    consolidated: view.consolidated,
    history: view.history,
    wallets,
  }
}

function buildWalletDetails(
  positions: Position[],
  positionViews: PositionView[],
  base: Money,
  kindByWallet: Map<string, WalletKind>,
  currency: CurrencyCode,
  toDisplay: (value: Money) => Money,
): WalletDetailView[] {
  const groups = new Map<string, Position[]>()
  for (const position of positions) {
    const bucket = groups.get(position.walletId)
    if (bucket) bucket.push(position)
    else groups.set(position.walletId, [position])
  }

  const details: WalletDetailView[] = []

  for (const [walletId, items] of groups) {
    const first = items[0]
    if (!first) continue

    const value = sum(items.map((p) => p.currentValue))
    const cost = sum(items.map((p) => p.totalCost))
    const aportado = sum(items.map((p) => p.totalInvested))
    const income = sum(items.map((p) => p.incomeTotal))
    const profit = value.minus(cost).plus(income)
    const walletShare = share(value, base)

    details.push({
      id: walletId,
      name: first.walletName,
      kind: kindByWallet.get(walletId) ?? 'OTHER',
      positionsCount: items.length,
      currentValue: toMoneyView(toDisplay(value), currency),
      totalCost: toMoneyView(toDisplay(cost), currency),
      totalInvested: toMoneyView(toDisplay(aportado), currency),
      income: toMoneyView(toDisplay(income), currency),
      profit: toMoneyView(toDisplay(profit), currency),
      change: toChangeView(percentOf(profit, cost)),
      shareText: formatShare(walletShare),
      shareRaw: walletShare.toNumber(),
      positions: positionViews.filter((p) => p.walletId === walletId),
    })
  }

  return details.sort((a, b) => b.currentValue.raw - a.currentValue.raw)
}

/**
 * Melhor e pior ativo do recorte.
 *
 * Com menos de dois ativos não existe "melhor e pior" — o mesmo item nos dois
 * cartões seria ruído. Nesse caso vem nulo e a tela mostra outra coisa.
 */
function rankPerformers(assets: ConsolidatedInstrumentView[]): {
  best: PerformerView | null
  worst: PerformerView | null
} {
  if (assets.length < 2) return { best: null, worst: null }

  const sorted = [...assets].sort((a, b) => b.change.raw - a.change.raw)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return { best: null, worst: null }

  const toPerformer = (a: ConsolidatedInstrumentView): PerformerView => ({
    symbol: a.symbol,
    name: a.name,
    change: a.change,
  })

  return { best: toPerformer(first), worst: toPerformer(last) }
}

function percentOf(part: Money, base: Money): Money {
  if (base.isZero()) return money(0)
  return part.dividedBy(base).times(100)
}
