'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Plus, Trash2, Wallet } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { EmptyState } from '@/components/ui/empty-state'
import type { ClassWorkspaceView, WalletDetailView } from '@/core/view/class-workspace-view'
import type { ConsolidatedInstrumentView, PositionView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

const GRID =
  'grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,0.9fr)_56px] items-center gap-4'

/**
 * Tabela de ativos da classe, densa como a do CoinMarketCap.
 *
 * Cada linha é o ativo CONSOLIDADO — 0,43 BTC, um preço médio só. A expansão
 * revela em que carteiras aquela quantidade está guardada.
 */
export function AssetTable({
  workspace,
  assets,
  wallets,
  query,
  showWalletBreakdown = true,
  onAdd,
  onTransact,
  onRemove,
}: {
  workspace: ClassWorkspaceView
  assets: ConsolidatedInstrumentView[]
  wallets: WalletDetailView[]
  query: string
  /** Num recorte de carteira única, expandir para mostrar a carteira é inútil. */
  showWalletBreakdown?: boolean
  onAdd: () => void
  /** Abre o diálogo de lançamento para uma posição específica. */
  onTransact: (position: PositionView) => void
  /** Arquiva a posição. Existe para desfazer um lançamento errado. */
  onRemove: (position: PositionView) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const showQuantity = workspace.labels.quantity !== null

  const positionsBySymbol = new Map<string, PositionView[]>()
  for (const wallet of wallets) {
    for (const position of wallet.positions) {
      const bucket = positionsBySymbol.get(position.symbol)
      if (bucket) bucket.push(position)
      else positionsBySymbol.set(position.symbol, [position])
    }
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        title={query ? 'Nada encontrado' : `Nenhum ${workspace.assetTerm.one.toLowerCase()} ainda`}
        description={
          query
            ? `Nenhum ativo corresponde a "${query}".`
            : `Adicione o primeiro ${workspace.assetTerm.one.toLowerCase()} desta classe.`
        }
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className={cn(GRID, 'border-b border-line px-5 py-3')}>
        <span className="text-caption uppercase text-fg-subtle">Nome</span>
        <span className="text-right text-caption uppercase text-fg-subtle">
          {workspace.labels.unitValue}
        </span>
        <span className="text-right text-caption uppercase text-fg-subtle">
          {workspace.labels.unitCost}
        </span>
        <span className="text-right text-caption uppercase text-fg-subtle">
          {showQuantity ? workspace.labels.quantity : workspace.walletTerm.many}
        </span>
        <span className="text-right text-caption uppercase text-fg-subtle">Valor atual</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Lucro / Perda</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Ações</span>
      </div>

      <div className="divide-y divide-line">
        {assets.map((asset) => {
          const expandable = showWalletBreakdown && asset.walletCount > 0
          const isOpen = expandable && open === asset.symbol
          const holdings = positionsBySymbol.get(asset.symbol) ?? []

          return (
            <div key={asset.symbol}>
              <div
                className={cn(
                  GRID,
                  'group relative px-5 py-4 transition-colors duration-[180ms]',
                  isOpen ? 'bg-raised/50' : 'hover:bg-raised/50',
                )}
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-0.5 origin-center scale-y-0 bg-accent transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-y-100"
                />

                <button
                  type="button"
                  onClick={() => (expandable ? setOpen(isOpen ? null : asset.symbol) : undefined)}
                  className={cn(
                    'flex min-w-0 items-center gap-3 text-left',
                    expandable ? '' : 'cursor-default',
                  )}
                >
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className={cn('shrink-0', expandable ? 'text-fg-subtle' : 'text-fg-subtle/0')}
                  >
                    <ChevronRight size={13} strokeWidth={2.2} />
                  </motion.span>

                  <AssetAvatar
                    symbol={asset.symbol}
                    name={asset.name}
                    logoUrl={asset.logoUrl}
                    classSlug={workspace.slug}
                    size={32}
                  />

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">
                      {asset.symbol}
                    </span>
                    <span className="block truncate text-caption normal-case tracking-normal text-fg-subtle">
                      {asset.name}
                    </span>
                  </span>
                </button>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                  {asset.currentPrice.text}
                </span>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                  {asset.avgPrice.text}
                </span>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                  {showQuantity ? asset.quantity : `${asset.walletCount}`}
                </span>

                <span className="sensitive numeric text-right text-sm font-medium text-fg">
                  {asset.currentValue.text}
                </span>

                <span className="flex flex-col items-end">
                  <TrendIndicator change={asset.change} size="sm" iconless />
                  <span className="sensitive numeric text-caption normal-case tracking-normal text-fg-subtle">
                    {asset.profit.raw >= 0 ? '+' : ''}
                    {asset.profit.text}
                  </span>
                </span>

                <span className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      // Com uma carteira só, não há ambiguidade: lança direto.
                      // Com várias, expandir força a escolha de qual carteira —
                      // adivinhar lançaria no lugar errado em silêncio.
                      const unica = holdings.length === 1 ? holdings[0] : undefined
                      if (unica) onTransact(unica)
                      else if (expandable) setOpen(asset.symbol)
                      else onAdd()
                    }}
                    aria-label={`Lançar em ${asset.symbol}`}
                    title={`Lançar em ${asset.symbol}`}
                    className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-[180ms] hover:border-accent/50 hover:text-accent"
                  >
                    <Plus size={13} strokeWidth={2.2} />
                  </button>
                </span>
              </div>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-line/60 bg-canvas/50 py-1">
                      {holdings.map((holding) => (
                        <div key={holding.id} className={cn(GRID, 'px-5 py-2.5 pl-[4.25rem]')}>
                          <span className="flex min-w-0 items-center gap-2">
                            <Wallet size={13} strokeWidth={1.9} className="shrink-0 text-fg-subtle" />
                            <span className="truncate text-[0.8125rem] text-fg-muted">
                              {holding.walletName}
                            </span>
                          </span>
                          <span className="sensitive numeric text-right text-caption normal-case tracking-normal text-fg-subtle">
                            {holding.currentPrice.text}
                          </span>
                          <span className="sensitive numeric text-right text-caption normal-case tracking-normal text-fg-subtle">
                            {holding.avgPrice.text}
                          </span>
                          <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                            {showQuantity ? holding.quantity : '1'}
                          </span>
                          <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                            {holding.currentValue.text}
                          </span>
                          <span className="flex justify-end">
                            <TrendIndicator change={holding.change} size="sm" iconless />
                          </span>
                          <span className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onTransact(holding)}
                              aria-label={`Lançar em ${holding.walletName}`}
                              title={`Lançar em ${holding.walletName}`}
                              className="rounded-sm border border-line p-1 text-fg-subtle transition-colors duration-[180ms] hover:border-accent/50 hover:text-accent"
                            >
                              <Plus size={12} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemove(holding)}
                              aria-label={`Remover de ${holding.walletName}`}
                              title={`Remover de ${holding.walletName}`}
                              className="rounded-sm border border-line p-1 text-fg-subtle transition-colors duration-[180ms] hover:border-danger/50 hover:text-danger"
                            >
                              <Trash2 size={12} strokeWidth={2.2} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
