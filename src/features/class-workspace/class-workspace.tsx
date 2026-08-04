'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Download, MoreHorizontal, Plus } from 'lucide-react'
import { AreaChartGlow } from '@/components/charts/area-chart-glow'
import { DonutAllocation } from '@/components/charts/donut-allocation'
import { ProfitLine } from '@/components/charts/profit-line'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { AnimatedNumber } from '@/components/data/animated-number'
import { PrivacyToggle } from '@/components/privacy/privacy-provider'
import { ViewSwitcher } from '@/components/layout/view-switcher'
import { matches, useCollapsedShell, useSearchScope } from '@/components/layout/shell-provider'
import { assetClass } from '@/config/asset-classes'
import { formatMoney } from '@/core/money/format'
import { icon } from '@/lib/icons'
import { createPosition, deletePosition } from '@/server/actions/position'
import {
  OVERVIEW_SCOPE,
  type ClassWorkspaceView,
  type PerformerView,
} from '@/core/view/class-workspace-view'
import type { NewPositionInput } from '@/server/validation/position'
import { TransactionDialog, type TransactionTarget } from '@/features/transactions/transaction-dialog'
import type { PositionView } from '@/core/view/portfolio-view'
import { AddPositionDialog } from './add-position-dialog'
import { AssetTable } from './asset-table'
import { ScopeRail } from './scope-rail'
import { WalletSection } from './wallet-section'

type Tab = 'assets' | 'wallets'
type ChartMode = 'history' | 'allocation' | 'wallets'

const CHART_TITLE: Record<ChartMode, string> = {
  history: 'Evolução',
  allocation: 'Alocação por ativo',
  wallets: 'Peso por carteira',
}

/**
 * Degradê da cor da classe para as fatias. Mistura com o cinza de apoio em vez
 * de trocar de matiz — o gráfico continua sendo da cor daquela classe.
 */
function tone(colorVar: string, index: number): string {
  const mix = Math.max(100 - index * 11, 34)
  return `color-mix(in oklab, ${colorVar} ${mix}%, var(--color-fg-subtle))`
}

export function ClassWorkspace({ initial }: { initial: ClassWorkspaceView }) {
  const workspace = initial
  const router = useRouter()
  const [scopeId, setScopeId] = useState(OVERVIEW_SCOPE)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Só true quando o clique foi especificamente em "Criar carteira" — o
  // formulário nasce apontando pra criação, em vez de pousar na primeira
  // carteira existente e obrigar quem clicou ali a trocar de opção sozinho.
  const [startWithNewWallet, setStartWithNewWallet] = useState(false)
  const [transactionTarget, setTransactionTarget] = useState<TransactionTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('assets')
  const [chartMode, setChartMode] = useState<ChartMode>('history')
  const [pending, startTransition] = useTransition()

  // Tela de classe pede largura: a lateral entra recolhida.
  useCollapsedShell()
  const query = useSearchScope(`Buscar em ${initial.name}`)

  const definition = assetClass(workspace.slug)
  const Icon = icon(definition.icon)

  const scope = workspace.scopes.find((s) => s.id === scopeId) ?? workspace.scopes[0]!
  const isOverview = scope.isOverview

  // Gráficos mostram agregados: sempre na moeda base, mesmo quando as linhas de
  // cripto estão em dólar. Somar moedas diferentes daria um número sem sentido.
  const baseCurrency = scope.summary.currentValue.currency

  const filtered = useMemo(() => {
    const consolidated = scope.consolidated.filter(
      (a) => matches(a.symbol, query) || matches(a.name, query),
    )
    const wallets = scope.wallets
      .map((w) => ({
        ...w,
        positions: w.positions.filter(
          (p) => matches(p.symbol, query) || matches(p.name, query) || matches(w.name, query),
        ),
      }))
      .filter((w) => matches(w.name, query) || w.positions.length > 0)

    return { consolidated, wallets }
  }, [scope, query])

  const assetSlices = scope.consolidated.map((asset, index) => ({
    key: asset.symbol,
    label: asset.symbol,
    value: asset.currentValue.raw,
    share:
      scope.summary.currentValue.raw === 0
        ? 0
        : (asset.currentValue.raw / scope.summary.currentValue.raw) * 100,
    color: tone(definition.colorVar, index),
  }))

  // Peso de cada carteira dentro da classe. `shareRaw` já vem calculado no
  // servidor com base no total da classe — não é conta feita aqui.
  const walletSlices = scope.wallets.map((wallet, index) => ({
    key: wallet.id,
    label: wallet.name,
    value: wallet.currentValue.raw,
    share: wallet.shareRaw,
    color: tone(definition.colorVar, index),
  }))

  // "Carteiras" só faz sentido no consolidado: dentro de uma carteira o gráfico
  // teria uma fatia só.
  const effectiveChartMode: ChartMode =
    chartMode === 'wallets' && !isOverview ? 'history' : chartMode

  /** Traduz a posição clicada no que o diálogo de lançamento precisa saber. */
  function openTransaction(position: PositionView) {
    setTransactionTarget({
      positionId: position.id,
      symbol: position.symbol,
      name: position.name,
      walletName: position.walletName,
      valuationMode: position.valuationMode,
      supportsDividends: workspace.supportsDividends,
      quantityLabel: workspace.labels.quantity,
      walletTerm: workspace.walletTerm.one,
    })
  }

  /**
   * Apaga a posição, com confirmação.
   *
   * Confirmação nativa em vez de diálogo próprio porque a ação é destrutiva e
   * rara: o custo de um clique acidental é alto, o de um `confirm` feio é
   * baixo. E o nome do ativo vai no texto — "tem certeza?" sozinho não deixa a
   * pessoa perceber que selecionou a linha errada.
   */
  function handleRemove(position: PositionView) {
    const ok = window.confirm(
      `Excluir ${position.symbol} de ${position.walletName}?\n\n` +
        'A posição e todos os lançamentos dela são apagados do banco. Não tem volta.',
    )
    if (!ok) return

    setError(null)

    startTransition(async () => {
      const result = await deletePosition(position.id)

      if (result.ok) router.refresh()
      else setError(result.error ?? 'Não foi possível excluir o ativo.')
    })
  }

  function handleAdd(input: NewPositionInput) {
    setError(null)

    startTransition(async () => {
      // O cliente não soma dinheiro: manda o lançamento e o servidor grava a
      // transação, recalcula a posição pelo ledger e revalida a rota.
      const result = await createPosition(input)

      if (result.ok) {
        setDialogOpen(false)
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível salvar o lançamento.')
      }
    })
  }

  return (
    // gap curto aqui puxa o painel para cima; a lateral compensa com margem
    // própria e fica onde estava. Só o conteúdo principal sobe.
    <div className="flex flex-col gap-2">
      {/* ------------------------------------------------------ cabeçalho --- */}
      <div>
        <Link
          href="/carteiras"
          className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-fg-subtle transition-colors duration-[180ms] hover:text-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Carteiras e classes
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="flex size-8 items-center justify-center rounded-md"
                style={{
                  backgroundColor: `color-mix(in oklab, ${definition.colorVar} 14%, transparent)`,
                }}
              >
                <Icon size={16} strokeWidth={2} style={{ color: definition.colorVar }} />
              </span>

              <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
                {workspace.name}
              </h1>

              {isOverview ? null : (
                <>
                  <span className="text-fg-subtle">/</span>
                  <span className="text-[1.375rem] font-semibold tracking-[-0.02em] text-fg-muted">
                    {scope.label}
                  </span>
                </>
              )}

            </div>
          </div>

          {/* Participação mora aqui, encostada nas ações: é um dado de contexto,
              não o número principal da tela. */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus size={15} strokeWidth={2.2} />
                {workspace.labels.addAction}
              </Button>
              <Button variant="secondary" size="sm" disabled title="Disponível na Fase 6">
                <Download size={14} strokeWidth={2} />
                Exportar
              </Button>
              <Button variant="ghost" size="sm" aria-label="Mais opções" disabled>
                <MoreHorizontal size={16} strokeWidth={2} />
              </Button>
            </div>

            <span className="numeric text-caption normal-case tracking-normal text-fg-subtle">
              {scope.summary.shareText}{' '}
              {isOverview ? 'do patrimônio' : `de ${workspace.name.toLowerCase()}`}
            </span>
          </div>
        </div>

      </div>

      {error ? (
        <p className="rounded-md border border-negative/25 bg-negative/10 px-4 py-3 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      {/* ------------------------------------ seletor + painel do recorte --- */}
      <div className="flex flex-col gap-4 xl:flex-row xl:gap-8">
        <ScopeRail
          workspace={workspace}
          activeId={scope.id}
          onSelect={setScopeId}
          onAdd={() => {
            setStartWithNewWallet(true)
            setDialogOpen(true)
          }}
        />

        {/*
          A troca de carteira é uma transição de conteúdo, não um carregamento:
          todos os recortes já vieram calculados. Um spinner aqui inventaria
          espera onde não existe.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scope.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex min-w-0 flex-1 flex-col gap-6"
          >
            {/*
              Solto, sem caixa, alinhado à coluna dos indicadores. É o número da
              tela — dentro de um card ele viraria só mais um indicador entre
              outros três. Fica aqui dentro, e não no cabeçalho, para trocar
              junto com o recorte quando o usuário muda de carteira.
            */}
            <div>
              <div className="group/value flex items-center gap-2">
                <p className="sensitive text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-fg">
                  <AnimatedNumber
                    value={scope.summary.currentValue.raw}
                    format={(v) => formatMoney(v, scope.summary.currentValue.currency)}
                  />
                </p>
                <PrivacyToggle />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <TrendIndicator change={scope.summary.change} />
                <span className="sensitive numeric text-[0.8125rem] text-fg-muted">
                  {scope.summary.profit.raw >= 0 ? '+' : ''}
                  {scope.summary.profit.text}
                </span>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <Card className="p-5">
                <p className="text-label uppercase text-fg-subtle">Lucro total</p>
                <p className="sensitive numeric mt-3 text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
                  {scope.summary.profit.text}
                </p>
                <p className="mt-1.5 text-caption normal-case tracking-normal text-fg-subtle">
                  valorização + {workspace.supportsDividends ? 'proventos' : 'renda gerada'}
                </p>
              </Card>

              <Card className="p-5">
                <p className="text-label uppercase text-fg-subtle">Base de custo</p>
                <p className="sensitive numeric mt-3 text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
                  {scope.summary.totalCost.text}
                </p>

                {/* Só aparece depois de existir uma venda. Enquanto os dois
                    números são iguais, repetir o mesmo valor com dois nomes
                    ensina o usuário a desconfiar da tela. */}
                {scope.summary.totalInvested.raw > 0 &&
                scope.summary.totalInvested.text !== scope.summary.totalCost.text ? (
                  <p className="sensitive mt-1.5 text-caption normal-case tracking-normal text-fg-subtle">
                    <span className="numeric">{scope.summary.totalInvested.text}</span> aportados no
                    total, contando o que já foi vendido
                  </p>
                ) : null}
                <p className="mt-1.5 text-caption normal-case tracking-normal text-fg-subtle">
                  {scope.summary.positionsCount}{' '}
                  {scope.summary.positionsCount === 1
                    ? workspace.assetTerm.one.toLowerCase()
                    : workspace.assetTerm.many.toLowerCase()}
                  {isOverview
                    ? ` em ${scope.summary.walletCount} ${
                        scope.summary.walletCount === 1
                          ? workspace.walletTerm.one.toLowerCase()
                          : workspace.walletTerm.many.toLowerCase()
                      }`
                    : ''}
                </p>
              </Card>

              <Card className="p-5">
                {scope.summary.best && scope.summary.worst ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Performer label="Melhor" performer={scope.summary.best} />
                    <Performer label="Pior" performer={scope.summary.worst} />
                  </div>
                ) : (
                  <>
                    <p className="text-label uppercase text-fg-subtle">
                      {workspace.supportsDividends ? 'Proventos' : 'Renda gerada'}
                    </p>
                    <p className="sensitive numeric mt-3 text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
                      {scope.summary.income.text}
                    </p>
                    <p className="mt-1.5 text-caption normal-case tracking-normal text-fg-subtle">
                      acumulada
                    </p>
                  </>
                )}
              </Card>
            </div>

            <div className="grid gap-5 2xl:grid-cols-[1.55fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{CHART_TITLE[effectiveChartMode]}</CardTitle>
                  <ViewSwitcher
                    layoutId="class-chart-mode"
                    options={
                      isOverview
                        ? [
                            { key: 'history' as const, label: 'Histórico' },
                            { key: 'allocation' as const, label: 'Alocação' },
                            { key: 'wallets' as const, label: workspace.walletTerm.many },
                          ]
                        : [
                            { key: 'history' as const, label: 'Histórico' },
                            { key: 'allocation' as const, label: 'Alocação' },
                          ]
                    }
                    value={effectiveChartMode}
                    onChange={setChartMode}
                  />
                </CardHeader>

                {effectiveChartMode === 'history' ? (
                  <AreaChartGlow data={scope.history} currency={baseCurrency} />
                ) : (
                  <div className="pt-4">
                    <DonutAllocation
                      slices={effectiveChartMode === 'wallets' ? walletSlices : assetSlices}
                      total={scope.summary.currentValue.compact}
                      totalLabel={isOverview ? workspace.name : scope.label}
                      currency={baseCurrency}
                    />
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lucro acumulado</CardTitle>
                </CardHeader>
                <ProfitLine data={scope.history} currency={baseCurrency} />
              </Card>
            </div>

            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                {isOverview ? (
                  <ViewSwitcher
                    layoutId="class-tab"
                    options={[
                      { key: 'assets' as const, label: workspace.assetTerm.many },
                      { key: 'wallets' as const, label: workspace.walletTerm.many },
                    ]}
                    value={tab}
                    onChange={setTab}
                  />
                ) : (
                  <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-fg">
                    {workspace.assetTerm.many} em {scope.label}
                  </h2>
                )}

                {query ? (
                  <span className="text-caption normal-case tracking-normal text-fg-subtle">
                    filtrando por “{query}”
                  </span>
                ) : null}
              </div>

              {isOverview && tab === 'wallets' ? (
                <WalletSection
                  workspace={workspace}
                  wallets={filtered.wallets}
                  onAdd={() => {
                    setStartWithNewWallet(false)
                    setDialogOpen(true)
                  }}
                  onTransact={openTransaction}
                />
              ) : (
                <AssetTable
                  workspace={workspace}
                  assets={filtered.consolidated}
                  wallets={filtered.wallets}
                  query={query}
                  showWalletBreakdown={isOverview}
                  onAdd={() => {
                    setStartWithNewWallet(false)
                    setDialogOpen(true)
                  }}
                  onTransact={openTransaction}
                  onRemove={handleRemove}
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AddPositionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspace={workspace}
        onSubmit={handleAdd}
        pending={pending}
        startWithNewWallet={startWithNewWallet}
      />

      <TransactionDialog
        open={transactionTarget !== null}
        onClose={() => setTransactionTarget(null)}
        target={transactionTarget}
      />
    </div>
  )
}

function Performer({ label, performer }: { label: string; performer: PerformerView }) {
  return (
    <div className="min-w-0">
      <p className="text-label uppercase text-fg-subtle">{label}</p>
      <p className="mt-3 truncate text-[0.9375rem] font-semibold text-fg">{performer.symbol}</p>
      <TrendIndicator change={performer.change} size="sm" className="mt-1" />
    </div>
  )
}
