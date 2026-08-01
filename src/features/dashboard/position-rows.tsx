'use client'

import type { PositionView } from '@/core/view/portfolio-view'
import { TrendIndicator } from '@/components/data/trend-indicator'

/**
 * Linhas de ativo exibidas dentro de uma classe ou carteira expandida.
 * `label` muda conforme o contexto: dentro da classe mostramos a carteira;
 * dentro da carteira, a quantidade já basta.
 */
export function PositionRows({
  positions,
  showWallet = true,
}: {
  positions: PositionView[]
  showWallet?: boolean
}) {
  if (positions.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-[0.8125rem] text-fg-subtle">
        Nenhum ativo nesta carteira ainda.
      </p>
    )
  }

  return (
    <div className="divide-y divide-line/60 border-t border-line/60 bg-canvas/40">
      {positions.map((position) => (
        <div
          key={position.id}
          className="grid grid-cols-[1.6fr_1fr_1fr_0.9fr] items-center gap-4 px-5 py-3 pl-14 transition-colors duration-[180ms] hover:bg-raised/60"
        >
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] font-medium text-fg">{position.symbol}</p>
            <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
              {showWallet ? position.walletName : position.name}
            </p>
          </div>

          <div className="numeric text-right text-[0.8125rem] text-fg-muted">
            {position.quantity}
          </div>

          <div className="sensitive numeric text-right text-[0.8125rem] text-fg">
            {position.currentValue.text}
          </div>

          <div className="flex justify-end">
            <TrendIndicator change={position.change} size="sm" iconless />
          </div>
        </div>
      ))}
    </div>
  )
}
