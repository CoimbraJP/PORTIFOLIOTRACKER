'use client'

import type { ReactNode } from 'react'

export interface TooltipRow {
  label: string
  value: string
  color?: string
}

export interface ChartTooltipProps {
  title: string
  rows: TooltipRow[]
  footer?: ReactNode
}

/** Superfície que FLUTUA sobre o conteúdo — aqui o glass é permitido. */
export function ChartTooltip({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div className="glass min-w-[168px] rounded-md p-3 shadow-lg">
      <p className="text-caption uppercase text-fg-subtle">{title}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[0.8125rem] text-fg-muted">
              {row.color ? (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
              ) : null}
              {row.label}
            </span>
            <span className="numeric text-[0.8125rem] font-medium text-fg">{row.value}</span>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-2 border-t border-line pt-2">{footer}</div> : null}
    </div>
  )
}
