'use client'

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const FIELD_BASE =
  'h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm text-fg ' +
  'placeholder:text-fg-subtle transition-colors duration-[180ms] ' +
  'hover:border-line-strong focus:border-accent/60 focus:outline-none ' +
  'focus:shadow-[var(--glow-control)] disabled:opacity-40'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, 'numeric', className)} {...props} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(FIELD_BASE, 'pr-8', className)} {...props} />
  },
)

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-label uppercase text-fg-subtle">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-caption normal-case tracking-normal text-negative">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-caption normal-case tracking-normal text-fg-subtle">
          {hint}
        </span>
      ) : null}
    </label>
  )
}
