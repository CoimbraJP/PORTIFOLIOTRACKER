'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { AllocationBar } from '@/components/data/allocation-bar'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { ClassAssets } from './class-assets'
import { assetClass } from '@/config/asset-classes'
import { icon } from '@/lib/icons'
import type {
  ClassSummaryView,
  ConsolidatedInstrumentView,
  PositionView,
} from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

export interface ClassTableProps {
  classes: ClassSummaryView[]
  positions: PositionView[]
  consolidated: ConsolidatedInstrumentView[]
}

export function ClassTable({ classes, positions, consolidated }: ClassTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-[1.6fr_1fr_1fr_0.9fr] gap-4 border-b border-line px-5 py-3">
        <span className="text-caption uppercase text-fg-subtle">Classe</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Investido</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Valor atual</span>
        <span className="text-right text-caption uppercase text-fg-subtle">Variação</span>
      </div>

      <div className="divide-y divide-line">
        {classes.map((row) => {
          const definition = assetClass(row.slug)
          const Icon = icon(definition.icon)
          const isOpen = expanded === row.slug

          return (
            <div key={row.slug}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : row.slug)}
                className={cn(
                  'group relative grid w-full grid-cols-[1.6fr_1fr_1fr_0.9fr] items-center gap-4',
                  'px-5 py-4 text-left transition-colors duration-[180ms]',
                  isOpen ? 'bg-raised/60' : 'hover:bg-raised/60',
                )}
              >
                {/* Barra de 2px que cresce a partir do centro no hover. */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-0.5 origin-center scale-y-0 bg-accent transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-y-100"
                />

                <div className="flex min-w-0 items-center gap-3">
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className="text-fg-subtle"
                  >
                    <ChevronRight size={15} strokeWidth={2.2} />
                  </motion.span>

                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `color-mix(in oklab, ${definition.colorVar} 14%, transparent)` }}
                  >
                    <Icon size={15} strokeWidth={2} style={{ color: definition.colorVar }} />
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{row.name}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <AllocationBar
                        value={row.shareRaw}
                        color={definition.colorVar}
                        className="w-16"
                      />
                      <span className="numeric text-caption normal-case tracking-normal text-fg-subtle">
                        {row.shareText} · {row.positionsCount}{' '}
                        {row.positionsCount === 1 ? 'ativo' : 'ativos'}
                      </span>
                    </span>
                  </span>
                </div>

                <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
                  {row.totalCost.text}
                </span>

                <span className="sensitive numeric text-right text-sm font-medium text-fg">
                  {row.currentValue.text}
                </span>

                <span className="flex justify-end">
                  <TrendIndicator change={row.change} size="sm" />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <ClassAssets
                      slug={row.slug}
                      positions={positions.filter((p) => p.classSlug === row.slug)}
                      consolidated={consolidated.filter((c) => c.classSlug === row.slug)}
                    />
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
