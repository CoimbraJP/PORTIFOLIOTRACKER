import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-fg-muted border-line',
  accent: 'bg-accent/10 text-accent border-accent/25',
  positive: 'bg-positive/10 text-positive border-positive/25',
  negative: 'bg-negative/10 text-negative border-negative/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5',
        'text-caption uppercase',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}
