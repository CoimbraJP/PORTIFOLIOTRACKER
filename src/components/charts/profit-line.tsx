'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { AXIS_TICK, chartTheme } from './chart-theme'
import { ChartTooltip } from './chart-tooltip'
import {
  formatDate,
  formatMoney,
  formatMonthShort,
  type CurrencyCode,
} from '@/core/money/format'
import type { HistoryPointView } from '@/core/view/portfolio-view'

/**
 * Lucro acumulado ao longo do tempo.
 *
 * Fica ao lado do gráfico de patrimônio e responde outra pergunta: não "quanto
 * eu tenho", mas "quanto disso eu ganhei". A cor é semântica — verde acima de
 * zero, vermelho abaixo.
 */
export function ProfitLine({
  data,
  currency = 'BRL',
}: {
  data: HistoryPointView[]
  currency?: CurrencyCode
}) {
  const last = data[data.length - 1]
  const positive = (last?.profit ?? 0) >= 0
  const color = positive ? chartTheme.positive : chartTheme.negative

  return (
    <div className="sensitive h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
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

          <Tooltip
            cursor={{ stroke: color, strokeDasharray: '3 3', strokeOpacity: 0.45 }}
            content={(props) => {
              const active = props.active as boolean | undefined
              const payload = props.payload as
                | readonly { payload?: HistoryPointView }[]
                | undefined
              const point = payload?.[0]?.payload
              if (!active || !point) return null
              return (
                <ChartTooltip
                  title={formatDate(point.date)}
                  rows={[{ label: 'Lucro acumulado', value: formatMoney(point.profit, currency), color }]}
                />
              )
            }}
          />

          <Area
            type="monotone"
            dataKey="profit"
            stroke={color}
            strokeWidth={2}
            fill="url(#profitFill)"
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: chartTheme.surface, strokeWidth: 2 }}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
