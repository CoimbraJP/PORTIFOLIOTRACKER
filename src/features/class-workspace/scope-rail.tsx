'use client'

import { motion } from 'motion/react'
import { LayoutGrid, Plus, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TrendIndicator } from '@/components/data/trend-indicator'
import { assetClass } from '@/config/asset-classes'
import type { ClassScopeView, ClassWorkspaceView } from '@/core/view/class-workspace-view'
import { cn } from '@/lib/cn'

/**
 * Seletor de recorte da classe.
 *
 * "Visão geral" consolida tudo; abaixo, cada carteira isolada. Selecionar uma
 * carteira filtra o dashboard inteiro — gráfico, cartões e tabela.
 */
export function ScopeRail({
  workspace,
  activeId,
  onSelect,
  onAdd,
}: {
  workspace: ClassWorkspaceView
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  const color = assetClass(workspace.slug).colorVar
  const [overview, ...wallets] = workspace.scopes

  return (
    <nav className="w-full shrink-0 xl:mt-4 xl:w-64">
      {overview ? (
        <ScopeItem
          scope={overview}
          active={activeId === overview.id}
          color={color}
          onSelect={onSelect}
        />
      ) : null}

      <p className="mb-2 mt-6 px-3 text-caption uppercase text-fg-subtle">
        {workspace.walletTerm.many} ({wallets.length})
      </p>

      <div className="space-y-1">
        {wallets.map((scope) => (
          <ScopeItem
            key={scope.id}
            scope={scope}
            active={activeId === scope.id}
            color={color}
            onSelect={onSelect}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-1.5 rounded-md',
          'border border-dashed border-line px-3 py-2.5',
          'text-[0.8125rem] text-fg-subtle transition-colors duration-[180ms]',
          'hover:border-accent/40 hover:text-accent',
        )}
      >
        <Plus size={14} strokeWidth={2.2} />
        Criar {workspace.walletTerm.one.toLowerCase()}
      </button>
    </nav>
  )
}

function ScopeItem({
  scope,
  active,
  color,
  onSelect,
}: {
  scope: ClassScopeView
  active: boolean
  color: string
  onSelect: (id: string) => void
}) {
  const Icon = scope.isOverview ? LayoutGrid : Wallet

  return (
    <button
      type="button"
      onClick={() => onSelect(scope.id)}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left',
        'transition-colors duration-[180ms]',
        active ? 'text-fg' : 'text-fg-muted hover:bg-raised',
      )}
    >
      {active ? (
        <motion.span
          layoutId="scope-active"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="absolute inset-0 -z-10 rounded-md border border-accent/22 bg-accent/8"
        />
      ) : null}

      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
      >
        <Icon size={15} strokeWidth={2} style={{ color }} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.8125rem] font-medium">{scope.label}</span>
        </span>
        <span className="sensitive numeric mt-0.5 block truncate text-caption normal-case tracking-normal text-fg-subtle">
          {scope.summary.currentValue.text}
        </span>
      </span>

      <TrendIndicator change={scope.summary.change} size="sm" iconless className="shrink-0" />
    </button>
  )
}
