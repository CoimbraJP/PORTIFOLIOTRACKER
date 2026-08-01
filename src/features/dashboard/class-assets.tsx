'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Wallet } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { assetClass } from '@/config/asset-classes'
import { VALUATION_LABELS } from '@/config/valuation-labels'
import type { AssetClassSlug } from '@/core/types/portfolio'
import type { ConsolidatedInstrumentView, PositionView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

export interface ClassAssetsProps {
  slug: AssetClassSlug
  consolidated: ConsolidatedInstrumentView[]
  positions: PositionView[]
}

/**
 * Expansão da classe na home: ATIVOS primeiro, carteiras depois.
 *
 * A pergunta que o usuário faz ao abrir "Criptomoedas" é "o que eu tenho e
 * quanto vale", não "quais exchanges eu uso". O ativo aparece consolidado —
 * 0,43 BTC, um preço médio só — e a distribuição entre carteiras fica a um
 * clique de distância, para quem precisar dela.
 *
 * A visão carteira-primeiro existe, mas mora em /carteiras.
 */
export function ClassAssets({ slug, consolidated, positions }: ClassAssetsProps) {
  const [open, setOpen] = useState<string | null>(null)
  const labels = VALUATION_LABELS[assetClass(slug).valuationMode]

  return (
    <div className="border-t border-line/60 bg-canvas/40">
      <div className="grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_0.8fr] gap-4 px-5 py-2 pl-12">
        <span className="text-caption uppercase text-fg-subtle">Ativo</span>
        <span className="text-right text-caption uppercase text-fg-subtle">
          {labels.quantity ?? ''}
        </span>
        <span className="text-right text-caption uppercase text-fg-subtle">
          {labels.unitValue}
        </span>
        <span className="text-right text-caption uppercase text-fg-subtle">{labels.unitCost}</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Valor atual</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Lucro / Perda</span>
      </div>

      <div className="divide-y divide-line/60 border-t border-line/60">
        {consolidated.map((asset) => {
          const isOpen = open === asset.symbol
          const holdings = positions.filter((p) => p.symbol === asset.symbol)
          const splitAcrossWallets = asset.walletCount > 1

          return (
            <div key={asset.symbol}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : asset.symbol)}
                className={cn(
                  'grid w-full grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_0.8fr] items-center gap-4',
                  'px-5 py-3 pl-12 text-left transition-colors duration-[180ms]',
                  isOpen ? 'bg-raised/50' : 'hover:bg-raised/50',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className={cn('shrink-0', splitAcrossWallets ? 'text-fg-subtle' : 'text-fg-subtle/40')}
                  >
                    <ChevronRight size={13} strokeWidth={2.2} />
                  </motion.span>

                  <AssetAvatar
                    symbol={asset.symbol}
                    name={asset.name}
                    logoUrl={asset.logoUrl}
                    classSlug={slug}
                    size={26}
                  />

                  <span className="min-w-0">
                    <span className="block truncate text-[0.8125rem] font-medium text-fg">
                      {asset.symbol}
                    </span>
                    <span className="block truncate text-caption normal-case tracking-normal text-fg-subtle">
                      {splitAcrossWallets
                        ? `${asset.name} · ${asset.walletCount} carteiras`
                        : `${asset.name} · ${asset.walletNames[0]}`}
                    </span>
                  </span>
                </span>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                  {labels.quantity ? asset.quantity : ''}
                </span>

                {/* Cotação da unidade. Sem ela dá para ver quanto a posição
                    inteira vale, mas não quanto vale UM ativo — que é o número
                    que se compara com a tela da corretora. */}
                <span className="sensitive numeric text-right text-[0.8125rem] font-medium text-fg-muted">
                  {asset.currentPrice.text}
                </span>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-subtle">
                  {asset.avgPrice.text}
                </span>

                <span className="sensitive numeric text-right text-[0.8125rem] font-medium text-fg">
                  {asset.currentValue.text}
                </span>

                <span className="flex flex-col items-end">
                  <TrendIndicator change={asset.change} size="sm" iconless />
                  <span className="sensitive numeric text-caption normal-case tracking-normal text-fg-subtle">
                    {asset.profit.raw >= 0 ? '+' : ''}
                    {asset.profit.text}
                  </span>
                </span>
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
                    <WalletDistribution holdings={holdings} showQuantity={labels.quantity !== null} />
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

/** Onde cada pedaço da posição está guardado. */
function WalletDistribution({
  holdings,
  showQuantity,
}: {
  holdings: PositionView[]
  showQuantity: boolean
}) {
  return (
    <div className="border-t border-line/60 bg-canvas/60 py-1">
      {holdings.map((holding) => (
        <div
          key={holding.id}
          className="grid grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_0.8fr] items-center gap-4 px-5 py-2 pl-[4.75rem]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Wallet size={13} strokeWidth={1.9} className="shrink-0 text-fg-subtle" />
            <span className="truncate text-[0.8125rem] text-fg-muted">{holding.walletName}</span>
          </span>

          <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
            {showQuantity ? holding.quantity : ''}
          </span>

          <span className="sensitive numeric text-right text-caption normal-case tracking-normal text-fg-subtle">
            {holding.currentPrice.text}
          </span>

          <span className="sensitive numeric text-right text-caption normal-case tracking-normal text-fg-subtle">
            {holding.avgPrice.text}
          </span>

          <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
            {holding.currentValue.text}
          </span>

          <span className="flex justify-end">
            <TrendIndicator change={holding.change} size="sm" iconless />
          </span>
        </div>
      ))}
    </div>
  )
}
