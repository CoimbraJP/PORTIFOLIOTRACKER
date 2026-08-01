import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm text-fg-subtle">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  )
}
