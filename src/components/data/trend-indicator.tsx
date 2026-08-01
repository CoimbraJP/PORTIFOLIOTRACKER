import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ChangeView } from '@/core/view/portfolio-view'
import { cn } from '@/lib/cn'

export interface TrendIndicatorProps {
  change: ChangeView
  size?: 'sm' | 'md'
  className?: string
  /** Esconde o ícone quando o espaço é apertado (linhas densas de tabela). */
  iconless?: boolean
}

/** Verde e vermelho aqui são SEMÂNTICOS: direção do valor. Nunca decorativos. */
export function TrendIndicator({
  change,
  size = 'md',
  className,
  iconless,
}: TrendIndicatorProps) {
  const tone =
    change.direction === 'up'
      ? 'text-positive'
      : change.direction === 'down'
        ? 'text-negative'
        : 'text-fg-subtle'

  const Icon =
    change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus

  return (
    <span
      className={cn(
        'numeric inline-flex items-center gap-0.5 font-medium',
        size === 'sm' ? 'text-[0.8125rem]' : 'text-sm',
        tone,
        className,
      )}
    >
      {iconless ? null : <Icon size={size === 'sm' ? 13 : 15} strokeWidth={2.2} />}
      {change.text}
    </span>
  )
}
