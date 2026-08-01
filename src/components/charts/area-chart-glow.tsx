'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AXIS_TICK, chartTheme } from './chart-theme'
import { ChartTooltip } from './chart-tooltip'
import {
  formatDate,
  formatMoney,
  formatMonthShort,
  type CurrencyCode,
} from '@/core/money/format'
import type { HistoryPointView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

const RANGES = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
  { key: 'all', label: 'Tudo', days: Number.POSITIVE_INFINITY },
] as const

type RangeKey = (typeof RANGES)[number]['key']

export interface AreaChartGlowProps {
  data: HistoryPointView[]
  /** Mostra também a linha de custo (valor investido). */
  showCost?: boolean
  /** Moeda dos rótulos. A série já chega convertida pelo servidor. */
  currency?: CurrencyCode
}

interface TooltipPayloadEntry {
  value?: number
  dataKey?: string | number
  payload?: HistoryPointView
}

export function AreaChartGlow({ data, showCost = true, currency = 'BRL' }: AreaChartGlowProps) {
  const [range, setRange] = useState<RangeKey>('6m')

  const visible = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(days)) return data
    return data.slice(Math.max(0, data.length - days))
  }, [data, range])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-sm border border-line bg-elevated p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-[6px] px-2.5 py-1 text-label transition-colors duration-[180ms]',
                range === r.key
                  ? 'bg-accent/14 text-accent'
                  : 'text-fg-subtle hover:text-fg-muted',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sensitive h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.accent} stopOpacity={0.18} />
                <stop offset="100%" stopColor={chartTheme.accent} stopOpacity={0} />
              </linearGradient>
              {/* O glow discreto da linha — docs/02 §7. */}
              <filter id="lineGlow" x="-20%" y="-40%" width="140%" height="180%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid
              vertical={false}
              stroke={chartTheme.grid}
              strokeDasharray="3 3"
              strokeOpacity={0.8}
            />

            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              minTickGap={48}
              tickFormatter={formatMonthShort}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={56}
              tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
            />

            <Tooltip
              cursor={{ stroke: chartTheme.accent, strokeDasharray: '3 3', strokeOpacity: 0.45 }}
              content={(props) => {
                const active = props.active as boolean | undefined
                const payload = props.payload as readonly TooltipPayloadEntry[] | undefined
                const point = payload?.[0]?.payload
                if (!active || !point) return null

                return (
                  <ChartTooltip
                    title={formatDate(point.date)}
                    rows={[
                      {
                        label: 'Patrimônio',
                        value: formatMoney(point.value, currency),
                        color: chartTheme.accent,
                      },
                      ...(showCost
                        ? [
                            {
                              label: 'Investido',
                              value: formatMoney(point.cost, currency),
                              color: chartTheme.axis,
                            },
                          ]
                        : []),
                    ]}
                  />
                )
              }}
            />

            {showCost ? (
              <Area
                type="monotone"
                dataKey="cost"
                stroke={chartTheme.axis}
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}

            <Area
              type="monotone"
              dataKey="value"
              stroke={chartTheme.accent}
              strokeWidth={2}
              fill="url(#areaFill)"
              filter="url(#lineGlow)"
              dot={false}
              activeDot={{
                r: 4,
                fill: chartTheme.accent,
                stroke: chartTheme.surface,
                strokeWidth: 2,
              }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
