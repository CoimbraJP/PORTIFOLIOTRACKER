'use client'

import { AnimatedNumber } from '@/components/data/animated-number'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { PrivacyToggle } from '@/components/privacy/privacy-provider'
import { formatMoney } from '@/core/money/format'
import type { PortfolioView } from '@/core/view/portfolio-view'

export function NetWorthHero({ portfolio }: { portfolio: PortfolioView }) {
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-xl border border-line bg-surface p-8">
      {/* Único glow em repouso da tela — e ainda assim quase imperceptível.
          É o elemento mais importante do produto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 size-72 rounded-full bg-accent/8 blur-3xl"
      />

      <p className="text-label uppercase text-fg-subtle">Patrimônio total</p>

      <div className="group/value mt-3 flex items-center gap-2">
        <p className="sensitive text-display text-fg">
          <AnimatedNumber
            value={portfolio.totalValue.raw}
            format={(v) => formatMoney(v, portfolio.totalValue.currency)}
          />
        </p>
        <PrivacyToggle />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5">
          <TrendIndicator change={portfolio.periodChange} />
          <span className="text-[0.8125rem] text-fg-subtle">nos últimos 30 dias</span>
        </span>

        <span className="sensitive numeric text-[0.8125rem] text-fg-muted">
          {portfolio.periodChangeValue.raw >= 0 ? '+' : ''}
          {portfolio.periodChangeValue.text}
        </span>
      </div>
    </div>
  )
}
