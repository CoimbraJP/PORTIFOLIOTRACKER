'use client'

import { AlertTriangle } from 'lucide-react'
import type { Proposal } from '@/core/reconstruct/to-proposals'
import { cn } from '@/lib/cn'

const ROTULO: Record<Proposal['type'], string> = {
  BUY: 'Compra',
  SELL: 'Venda',
  BONUS: 'Bonificação',
  SPLIT: 'Desdobramento',
  REVERSE_SPLIT: 'Grupamento',
  TRANSFERENCIA: 'Troca de código',
}

/** Tipos que o usuário pode escolher no lugar do que o sistema propôs. */
const ESCOLHAS: Proposal['type'][] = ['BUY', 'SELL', 'BONUS', 'SPLIT', 'REVERSE_SPLIT']

/** Quantidade muda, dinheiro não: nestes o campo de preço some. */
const SEM_PRECO = new Set<Proposal['type']>(['BONUS', 'SPLIT', 'REVERSE_SPLIT', 'TRANSFERENCIA'])

export function ProposalRow({
  proposta,
  onMudar,
}: {
  proposta: Proposal
  onMudar: (mudanca: Partial<Proposal>) => void
}) {
  const semPreco = SEM_PRECO.has(proposta.type)
  const trocavel = proposta.type !== 'TRANSFERENCIA'

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 border-b border-line/50 px-1 py-3',
        !proposta.incluir && 'opacity-40',
        proposta.incluir && proposta.confirmar && 'bg-warning/[0.05]',
      )}
    >
      <input
        type="checkbox"
        checked={proposta.incluir}
        onChange={(e) => onMudar({ incluir: e.target.checked })}
        aria-label={`Incluir ${proposta.symbol} de ${proposta.year}`}
        className="mt-1 size-4 accent-[var(--color-accent)]"
      />

      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium text-fg">
          {proposta.symbol}
          {proposta.fromSymbol ? (
            <span className="ml-2 font-normal text-fg-subtle">← {proposta.fromSymbol}</span>
          ) : null}
        </p>

        {/* Quantidade editável: o relatório deduz pela diferença entre dois
            anos, e a corretora sabe o número exato de cada negócio — quem
            conferir contra o extrato precisa poder corrigir aqui, não só o
            preço. */}
        <label className="mt-1 flex items-center gap-1.5 text-caption normal-case tracking-normal text-fg-subtle">
          Quantidade
          <input
            value={proposta.quantity}
            onChange={(e) => onMudar({ quantity: e.target.value })}
            inputMode="decimal"
            aria-label={`Quantidade de ${proposta.symbol}`}
            className="numeric h-6 w-24 rounded border border-line bg-surface px-1.5 text-right text-[0.8125rem] text-fg transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none"
          />
        </label>

        <p
          className={cn(
            'mt-1 text-caption normal-case leading-relaxed tracking-normal',
            proposta.confirmar ? 'text-warning' : 'text-fg-subtle',
          )}
        >
          {proposta.confirmar ? (
            <AlertTriangle className="mr-1 inline size-3" aria-hidden />
          ) : null}
          {proposta.motivo}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {trocavel ? (
          <select
            value={proposta.type}
            onChange={(e) => {
              const type = e.target.value as Proposal['type']

              // Sair de um tipo sem preço para um com preço não pode deixar o
              // campo em branco: quem corrige um desdobramento mal detectado
              // para compra precisa de um número para conferir, não de um
              // convite a inventar um.
              const precisaDePreco = !SEM_PRECO.has(type) && !proposta.unitPrice
              onMudar({
                type,
                ...(precisaDePreco ? { unitPrice: proposta.referencePrice } : {}),
              })
            }}
            aria-label={`Tipo do lançamento de ${proposta.symbol}`}
            className="h-8 rounded-md border border-line bg-surface px-2 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none"
          >
            {ESCOLHAS.map((t) => (
              <option key={t} value={t}>
                {ROTULO[t]}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-md border border-line px-2 py-1 text-caption normal-case tracking-normal text-fg-subtle">
            {ROTULO[proposta.type]}
          </span>
        )}

        {/* A data nasce em 31/12, que é a data do preço. Trocar é permitido e
            comum — mas aí o preço vira responsabilidade de quem trocou, e por
            isso o campo ao lado continua aberto. */}
        <input
          type="date"
          value={proposta.date}
          min={`${proposta.year}-01-01`}
          max={`${proposta.year}-12-31`}
          onChange={(e) => onMudar({ date: e.target.value })}
          aria-label={`Data de ${proposta.symbol}`}
          className="numeric h-8 rounded-md border border-line bg-surface px-2 text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none"
        />

        {semPreco ? (
          <span className="w-28 text-right text-caption normal-case tracking-normal text-fg-subtle">
            sem preço
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className="text-fg-subtle">R$</span>
            <input
              value={proposta.unitPrice}
              onChange={(e) => onMudar({ unitPrice: e.target.value })}
              inputMode="decimal"
              aria-label={`Preço de ${proposta.symbol}`}
              className="numeric h-8 w-24 rounded-md border border-line bg-surface px-2 text-right text-sm text-fg transition-colors duration-[180ms] hover:border-line-strong focus:border-accent/60 focus:outline-none"
            />
          </span>
        )}
      </div>
    </div>
  )
}
