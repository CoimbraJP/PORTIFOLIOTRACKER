'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/cn'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
  /**
   * `positive` pinta o estado ligado de verde.
   *
   * É uma exceção consciente à regra de que verde e vermelho são semânticos
   * (alta e baixa) — docs/02 §2. Aqui verde não fala de dinheiro, fala de
   * "ligado", que é a convenção universal de interruptor. Usar o ciano faria o
   * toggle competir visualmente com foco e hover, que já são ciano.
   */
  tone?: 'accent' | 'positive'
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
  tone = 'accent',
}: SwitchProps) {
  const on =
    tone === 'positive'
      ? 'border-positive/50 bg-positive/25 shadow-[var(--glow-positive)]'
      : 'border-accent/50 bg-accent/25 shadow-[var(--glow-control)]'

  const knob = tone === 'positive' ? 'bg-positive' : 'bg-accent'

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-[180ms]',
        'disabled:pointer-events-none disabled:opacity-40',
        checked ? on : 'border-line bg-raised',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full',
          checked ? `left-6 ${knob}` : 'left-1 bg-fg-subtle',
        )}
      />
    </button>
  )
}
