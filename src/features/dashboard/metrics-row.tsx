'use client'

import { Coins, PiggyBank, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '@/components/data/animated-number'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { HoverCard } from '@/components/motion/hover-card'
import { Stagger, StaggerItem } from '@/components/motion/stagger'
import { formatMoney } from '@/core/money/format'
import type { ChangeView, MoneyView, PortfolioView } from '@/core/view/portfolio-view'

/**
 * Ocupa a metade direita da primeira dobra, ao lado do patrimônio total.
 * Cards mais compactos que os originais — três em ~700px pedem contenção.
 */
export function MetricsRow({ portfolio }: { portfolio: PortfolioView }) {
  return (
    <Stagger className="grid h-full gap-5 sm:grid-cols-3">
      <StaggerItem className="h-full">
        <CompactMetric
          label="Valor investido"
          value={portfolio.totalCost}
          hint="custo de aquisição"
          icon={PiggyBank}
        />
      </StaggerItem>

      <StaggerItem className="h-full">
        <CompactMetric
          label="Lucro total"
          value={portfolio.profit}
          change={portfolio.change}
          icon={TrendingUp}
        />
      </StaggerItem>

      <StaggerItem className="h-full">
        <CompactMetric
          label="Renda passiva"
          value={portfolio.totalIncome}
          hint="acumulada"
          icon={Coins}
        />
      </StaggerItem>
    </Stagger>
  )
}

function CompactMetric({
  label,
  value,
  change,
  hint,
  icon: Icon,
}: {
  label: string
  value: MoneyView
  change?: ChangeView
  hint?: string
  icon: LucideIcon
}) {
  return (
    <HoverCard glow={false} className="flex h-full flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-label uppercase leading-tight text-fg-subtle">{label}</p>
        <Icon
          size={15}
          className="shrink-0 text-fg-subtle transition-colors duration-[180ms] group-hover:text-accent"
        />
      </div>

      <div className="mt-6">
        <p className="sensitive text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">
          {/* A moeda vem do próprio valor: o contador precisa do mesmo símbolo
              que o resto da tela. */}
          <AnimatedNumber value={value.raw} format={(v) => formatMoney(v, value.currency)} />
        </p>
        <div className="mt-1.5">
          {change ? (
            <TrendIndicator change={change} size="sm" />
          ) : (
            <span className="text-caption normal-case tracking-normal text-fg-subtle">{hint}</span>
          )}
        </div>
      </div>
    </HoverCard>
  )
}
