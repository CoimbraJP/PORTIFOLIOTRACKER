'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { HoverCard } from '@/components/motion/hover-card'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { Badge } from '@/components/ui/badge'
import { PositionRows } from './position-rows'
import { assetClass } from '@/config/asset-classes'
import { icon } from '@/lib/icons'
import type { PositionView, WalletSummaryView } from '@/core/view/portfolio-view'

const KIND_LABEL: Record<WalletSummaryView['kind'], string> = {
  BROKER: 'Corretora',
  EXCHANGE: 'Exchange',
  SELF_CUSTODY: 'Autocustódia',
  BANK: 'Banco',
  OTHER: 'Outros',
}

export function WalletGrid({
  wallets,
  positions,
}: {
  wallets: WalletSummaryView[]
  positions: PositionView[]
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {wallets.map((wallet) => {
        const definition = assetClass(wallet.classSlug)
        const Icon = icon(definition.icon)
        const isOpen = open === wallet.id

        return (
          <HoverCard
            key={wallet.id}
            glow={false}
            className="overflow-hidden"
            onClick={() => setOpen(isOpen ? null : wallet.id)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${definition.colorVar} 14%, transparent)`,
                    }}
                  >
                    <Icon size={16} strokeWidth={2} style={{ color: definition.colorVar }} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{wallet.name}</p>
                    <p className="mt-0.5 truncate text-caption normal-case tracking-normal text-fg-subtle">
                      {wallet.positionsCount} {wallet.positionsCount === 1 ? 'ativo' : 'ativos'} ·{' '}
                      {wallet.shareText} do total
                    </p>
                  </div>
                </div>

                <Badge tone="neutral">{KIND_LABEL[wallet.kind]}</Badge>
              </div>

              <p className="sensitive numeric mt-5 text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
                {wallet.currentValue.text}
              </p>

              <div className="mt-2 flex items-center justify-between">
                <TrendIndicator change={wallet.change} size="sm" />
                <span className="flex items-center gap-1 text-caption uppercase text-fg-subtle">
                  {isOpen ? 'Fechar' : 'Ver ativos'}
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ChevronRight size={13} strokeWidth={2.2} />
                  </motion.span>
                </span>
              </div>
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
                  <div className="[&_.pl-14]:pl-5">
                    <PositionRows
                      positions={positions.filter((p) => p.walletId === wallet.id)}
                      showWallet={false}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </HoverCard>
        )
      })}
    </div>
  )
}
