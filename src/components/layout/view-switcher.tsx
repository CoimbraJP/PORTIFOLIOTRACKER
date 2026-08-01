'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/cn'

export interface ViewSwitcherOption<T extends string> {
  key: T
  label: string
}

export interface ViewSwitcherProps<T extends string> {
  options: readonly ViewSwitcherOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Precisa ser único por instância — é o layoutId do indicador. */
  layoutId: string
}

/** Indicador desliza com layoutId; o conteúdo faz cross-fade — docs/02 §5. */
export function ViewSwitcher<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: ViewSwitcherProps<T>) {
  return (
    <div className="inline-flex rounded-md border border-line bg-elevated p-1">
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              'relative rounded-sm px-3.5 py-1.5 text-[0.8125rem] font-medium',
              'transition-colors duration-[180ms]',
              active ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-sm border border-accent/25 bg-accent/12"
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
