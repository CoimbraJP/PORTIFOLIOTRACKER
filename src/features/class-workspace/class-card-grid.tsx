'use client'

import Link from 'next/link'
import { ArrowUpRight, Plus } from 'lucide-react'
import { HoverCard } from '@/components/motion/hover-card'
import { Stagger, StaggerItem } from '@/components/motion/stagger'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { AllocationBar } from '@/components/data/allocation-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { matches, useSearchScope } from '@/components/layout/shell-provider'
import { assetClass } from '@/config/asset-classes'
import { icon } from '@/lib/icons'
import type { ClassSummaryView } from '@/core/view/portfolio-view'
import type { AssetClassSlug } from '@/core/types/portfolio'

export interface ClassCardData {
  slug: AssetClassSlug
  name: string
  walletTerm: string
  assetTerm: string
  walletCount: number
  summary: ClassSummaryView | null
}

export function ClassCardGrid({ items }: { items: ClassCardData[] }) {
  const query = useSearchScope('Buscar classe de ativo')
  const visible = items.filter((item) => matches(item.name, query))

  if (visible.length === 0) {
    return (
      <EmptyState
        title="Nada encontrado"
        description={`Nenhuma classe corresponde a "${query}".`}
      />
    )
  }

  return (
    <Stagger className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) => (
        <StaggerItem key={item.slug}>
          <ClassCard item={item} />
        </StaggerItem>
      ))}
    </Stagger>
  )
}

function ClassCard({ item }: { item: ClassCardData }) {
  const definition = assetClass(item.slug)
  const Icon = icon(definition.icon)
  const empty = item.summary === null

  return (
    <Link href={{ pathname: `/carteiras/${item.slug}` }} className="block">
      <HoverCard className="h-full p-6">
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `color-mix(in oklab, ${definition.colorVar} 14%, transparent)`,
            }}
          >
            <Icon size={18} strokeWidth={2} style={{ color: definition.colorVar }} />
          </span>

          <ArrowUpRight
            size={16}
            className="text-fg-subtle/0 transition-colors duration-[180ms] group-hover:text-accent"
          />
        </div>

        <p className="mt-4 text-sm font-medium text-fg">{item.name}</p>

        {empty ? (
          <>
            <p className="mt-1 text-caption normal-case tracking-normal text-fg-subtle">
              Nenhuma {item.walletTerm.toLowerCase()} ainda
            </p>
            <p className="mt-6 inline-flex items-center gap-1.5 text-[0.8125rem] text-accent">
              <Plus size={14} strokeWidth={2.2} />
              Começar
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-caption normal-case tracking-normal text-fg-subtle">
              {item.walletCount}{' '}
              {item.walletCount === 1 ? item.walletTerm.toLowerCase() : pluralize(item.walletTerm)} ·{' '}
              {item.summary!.positionsCount}{' '}
              {item.summary!.positionsCount === 1
                ? item.assetTerm.toLowerCase()
                : pluralize(item.assetTerm)}
            </p>

            <p className="sensitive numeric mt-6 text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
              {item.summary!.currentValue.text}
            </p>

            <div className="mt-2 flex items-center justify-between">
              <TrendIndicator change={item.summary!.change} size="sm" />
              <span className="numeric text-caption normal-case tracking-normal text-fg-subtle">
                {item.summary!.shareText} do total
              </span>
            </div>

            <AllocationBar
              value={item.summary!.shareRaw}
              color={definition.colorVar}
              className="mt-4"
            />
          </>
        )}
      </HoverCard>
    </Link>
  )
}

function pluralize(term: string): string {
  const lower = term.toLowerCase()
  if (lower.endsWith('s')) return lower
  if (lower.endsWith('ão')) return `${lower.slice(0, -2)}ões`
  if (lower.endsWith('l')) return `${lower.slice(0, -1)}is`
  return `${lower}s`
}
