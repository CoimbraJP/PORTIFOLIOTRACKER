'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Plus, Wallet } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { AllocationBar } from '@/components/data/allocation-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { assetClass } from '@/config/asset-classes'
import type { ClassWorkspaceView, WalletDetailView } from '@/core/view/class-workspace-view'
import type { PositionView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

const KIND_LABEL: Record<WalletDetailView['kind'], string> = {
  BROKER: 'Corretora',
  EXCHANGE: 'Exchange',
  SELF_CUSTODY: 'Autocustódia',
  BANK: 'Banco',
  OTHER: '',
}

export function WalletSection({
  workspace,
  wallets,
  onAdd,
  onTransact,
}: {
  workspace: ClassWorkspaceView
  wallets: WalletDetailView[]
  onAdd: () => void
  onTransact: (position: PositionView) => void
}) {
  const [open, setOpen] = useState<string | null>(wallets[0]?.id ?? null)
  const color = assetClass(workspace.slug).colorVar
  const showQuantity = workspace.labels.quantity !== null

  return (
    <section>
      {wallets.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} strokeWidth={1.8} />}
          title={`Nenhuma ${workspace.walletTerm.one.toLowerCase()} em ${workspace.name}`}
          description={`Crie a primeira ${workspace.walletTerm.one.toLowerCase()} e adicione ${workspace.assetTerm.many.toLowerCase()} a ela.`}
          action={
            <Button variant="primary" onClick={onAdd}>
              <Plus size={15} strokeWidth={2.2} />
              {workspace.labels.addAction}
            </Button>
          }
        />
      ) : null}

      <div className="space-y-4">
        {wallets.map((wallet) => {
          const isOpen = open === wallet.id
          const kindLabel = KIND_LABEL[wallet.kind]

          return (
            <div
              key={wallet.id}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : wallet.id)}
                className={cn(
                  'w-full px-6 py-5 text-left transition-colors duration-[180ms]',
                  isOpen ? 'bg-raised/40' : 'hover:bg-raised/40',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <motion.span
                      animate={{ rotate: isOpen ? 90 : 0 }}
                      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      className="text-fg-subtle"
                    >
                      <ChevronRight size={15} strokeWidth={2.2} />
                    </motion.span>

                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
                    >
                      <Wallet size={16} strokeWidth={2} style={{ color }} />
                    </span>

                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">{wallet.name}</span>
                        {kindLabel ? <Badge tone="neutral">{kindLabel}</Badge> : null}
                      </span>
                      <span className="mt-1 block text-caption normal-case tracking-normal text-fg-subtle">
                        {wallet.positionsCount}{' '}
                        {wallet.positionsCount === 1
                          ? workspace.assetTerm.one.toLowerCase()
                          : workspace.assetTerm.many.toLowerCase()}{' '}
                        · {wallet.shareText} desta classe
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center gap-8">
                    <Metric label="Investido" value={wallet.totalCost.text} muted />
                    <Metric label="Valor atual" value={wallet.currentValue.text} />
                    <div className="text-right">
                      <p className="text-caption uppercase text-fg-subtle">Lucro</p>
                      <p className="sensitive numeric mt-1 text-[0.8125rem] font-medium text-fg">
                        {wallet.profit.text}
                      </p>
                      <TrendIndicator change={wallet.change} size="sm" iconless className="mt-0.5" />
                    </div>
                  </div>
                </div>

                <AllocationBar value={wallet.shareRaw} color={color} className="mt-4" />
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-line bg-canvas/40">
                      <div className="grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_0.9fr] gap-4 px-6 py-2">
                        <span className="text-caption uppercase text-fg-subtle">
                          {workspace.assetTerm.one}
                        </span>
                        <span className="text-right text-caption uppercase text-fg-subtle">
                          {workspace.labels.quantity ?? ''}
                        </span>
                        <span className="text-right text-caption uppercase text-fg-subtle">
                          {workspace.labels.unitValue}
                        </span>
                        <span className="text-right text-caption uppercase text-fg-subtle">
                          {workspace.labels.unitCost}
                        </span>
                        <span className="text-right text-caption uppercase text-fg-subtle">
                          Valor atual
                        </span>
                        <span className="text-right text-caption uppercase text-fg-subtle">
                          Lucro / Perda
                        </span>
                      </div>

                      <div className="divide-y divide-line/60 border-t border-line/60">
                        {wallet.positions.map((position) => (
                          <div
                            key={position.id}
                            className="grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_0.9fr] items-center gap-4 px-6 py-3 transition-colors duration-[180ms] hover:bg-raised/40"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <AssetAvatar
                                symbol={position.symbol}
                                name={position.name}
                                logoUrl={position.logoUrl}
                                classSlug={workspace.slug}
                                size={26}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[0.8125rem] font-medium text-fg">
                                  {position.symbol}
                                </p>
                                <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
                                  {position.name}
                                </p>
                              </div>
                            </div>
                            <div className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                              {showQuantity ? position.quantity : ''}
                            </div>
                            {/* Cotação da unidade — o número que se confere
                                contra a tela da corretora. */}
                            <div className="sensitive numeric text-right text-[0.8125rem] font-medium text-fg-muted">
                              {position.currentPrice.text}
                            </div>
                            <div className="sensitive numeric text-right text-[0.8125rem] text-fg-subtle">
                              {position.avgPrice.text}
                            </div>
                            <div className="sensitive numeric text-right text-[0.8125rem] font-medium text-fg">
                              {position.currentValue.text}
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <TrendIndicator change={position.change} size="sm" iconless />
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onTransact(position)
                                }}
                                aria-label={`Lançar em ${position.symbol}`}
                                title={`Lançar em ${position.symbol}`}
                                className="rounded-sm border border-line p-1 text-fg-subtle transition-colors duration-[180ms] hover:border-accent/50 hover:text-accent"
                              >
                                <Plus size={12} strokeWidth={2.2} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="hidden text-right sm:block">
      <p className="text-caption uppercase text-fg-subtle">{label}</p>
      <p
        className={cn(
          'sensitive numeric mt-1 text-[0.8125rem]',
          muted ? 'text-fg-muted' : 'font-medium text-fg',
        )}
      >
        {value}
      </p>
    </div>
  )
}
