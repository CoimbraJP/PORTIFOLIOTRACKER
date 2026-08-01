'use client'

import type { LucideIcon } from 'lucide-react'
import { HoverCard } from '@/components/motion/hover-card'
import { AnimatedNumber } from '@/components/data/animated-number'
import { TrendIndicator } from '@/components/data/trend-indicator'
import type { ChangeView, MoneyView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

export interface MetricCardProps {
  label: string
  value: MoneyView
  change?: ChangeView
  hint?: string
  icon?: LucideIcon
  /** Formatador aplicado durante a animação do contador. */
  format: (value: number) => string
  delay?: number
}

export function MetricCard({
  label,
  value,
  change,
  hint,
  icon: Icon,
  format,
}: MetricCardProps) {
  return (
    <HoverCard glow={false} className="p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label uppercase text-fg-subtle">{label}</p>
        {Icon ? (
          <Icon
            size={16}
            className="text-fg-subtle transition-colors duration-[180ms] group-hover:text-accent"
          />
        ) : null}
      </div>

      <p className={cn('sensitive mt-4 text-metric text-fg')}>
        <AnimatedNumber value={value.raw} format={format} />
      </p>

      <div className="mt-2 flex items-center gap-2">
        {change ? <TrendIndicator change={change} size="sm" /> : null}
        {hint ? <span className="text-[0.8125rem] text-fg-subtle">{hint}</span> : null}
      </div>
    </HoverCard>
  )
}
