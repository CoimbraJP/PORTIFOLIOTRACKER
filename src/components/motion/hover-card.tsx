'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface HoverCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  /** Desliga o glow em cards secundários — no máximo um brilho por região. */
  glow?: boolean
}

/**
 * O efeito de card padrão do produto.
 *
 * Sobe 4px, ganha sombra e a borda ilumina. `boxShadow` fica em transição CSS
 * (não em keyframe de animação) e o movimento vai por `transform` — docs/02 §5.
 */
export function HoverCard({ children, className, onClick, glow = true }: HoverCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onClick={onClick}
      className={cn(
        'group rounded-xl border border-line bg-surface shadow-sm',
        'transition-[box-shadow,border-color] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:shadow-lg',
        glow
          ? 'hover:border-accent/28 hover:shadow-[var(--glow-card-hover)]'
          : 'hover:border-line-strong',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
