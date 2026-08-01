import { cn } from '@/lib/cn'

/** Shimmer sutil por opacidade. Nunca spinner — docs/02 §5. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-raised', className)} />
}
