'use client'

import { motion, type HTMLMotionProps } from 'motion/react'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // Glow só no hover e no foco. Nunca em repouso — docs/02 §6.
  primary:
    'bg-accent/12 text-accent border border-accent/30 hover:border-accent/60 hover:bg-accent/20 hover:shadow-[var(--glow-button)]',
  secondary:
    'bg-elevated text-fg border border-line hover:border-line-strong hover:bg-raised',
  ghost: 'text-fg-muted border border-transparent hover:text-fg hover:bg-raised',
  danger:
    'bg-negative/10 text-negative border border-negative/25 hover:border-negative/50 hover:bg-negative/16',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-label rounded-sm gap-1.5',
  md: 'h-10 px-4 text-sm rounded-md gap-2',
  lg: 'h-12 px-6 text-base rounded-md gap-2',
}

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      // Confirma o toque sem parecer brinquedo: 0.97, não 0.9.
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})
