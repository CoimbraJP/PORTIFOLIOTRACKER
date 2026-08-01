'use client'

import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltip } from './chart-tooltip'
import { formatMoney, formatShare, type CurrencyCode } from '@/core/money/format'

export interface DonutSlice {
  key: string
  label: string
  value: number
  /** Participação em pontos percentuais. */
  share: number
  color: string
}

export interface DonutAllocationProps {
  slices: DonutSlice[]
  /** Texto no centro do anel. */
  total: string
  /** Rótulo acima do total. */
  totalLabel?: string
  /** Quantas fatias listar na legenda antes de agrupar em "outros". */
  legendLimit?: number
  currency?: CurrencyCode
}

export function DonutAllocation({
  slices,
  total,
  totalLabel = 'Total',
  legendLimit = 8,
  currency = 'BRL',
}: DonutAllocationProps) {
  const [active, setActive] = useState<number | null>(null)
  const legend = slices.slice(0, legendLimit)
  const hidden = slices.length - legend.length

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
      <div className="relative h-[220px] w-full lg:w-[220px] lg:shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="72%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              animationDuration={900}
              onMouseEnter={(_, index: number) => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.key}
                  fill={slice.color}
                  fillOpacity={active === null || active === index ? 1 : 0.45}
                  style={{
                    transition: 'fill-opacity 180ms cubic-bezier(0.16,1,0.3,1)',
                    outline: 'none',
                  }}
                />
              ))}
            </Pie>
            <Tooltip
              content={(props) => {
                const isActive = props.active as boolean | undefined
                const payload = props.payload as readonly { payload?: DonutSlice }[] | undefined
                const slice = payload?.[0]?.payload
                if (!isActive || !slice) return null
                return (
                  <ChartTooltip
                    title={slice.label}
                    rows={[
                      { label: 'Valor', value: formatMoney(slice.value, currency), color: slice.color },
                      { label: 'Participação', value: formatShare(slice.share) },
                    ]}
                  />
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-caption uppercase text-fg-subtle">{totalLabel}</span>
          <span className="sensitive numeric mt-1 text-[0.9375rem] font-semibold text-fg">
            {total}
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {legend.map((slice, index) => (
          <li
            key={slice.key}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 transition-colors duration-[180ms] hover:bg-raised"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="truncate text-[0.8125rem] text-fg-muted">{slice.label}</span>
            </span>
            <span className="numeric shrink-0 text-[0.8125rem] font-medium text-fg">
              {formatShare(slice.share)}
            </span>
          </li>
        ))}
        {hidden > 0 ? (
          <li className="px-2 pt-1 text-caption normal-case tracking-normal text-fg-subtle">
            + {hidden} {hidden === 1 ? 'outro' : 'outros'}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
