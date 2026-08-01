import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Superfície base do dashboard.
 *
 * Não usa glass: cards são a base, não a camada que flutua. Glass sobre glass
 * vira sopa visual — docs/02 §8.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface shadow-sm',
        'p-6',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 flex items-start justify-between gap-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[0.8125rem] text-fg-subtle', className)} {...props} />
}
