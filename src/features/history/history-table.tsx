'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeftRight, Coins, Split, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input, Select } from '@/components/ui/input'
import { matches, useSearchScope } from '@/components/layout/shell-provider'
import { deleteTransaction } from '@/server/actions/edit-transaction'
import type { HistoryEntry, HistoryResult } from '@/server/queries/history'
import { cn } from '@/lib/cn'

const GROUPS = [
  { key: 'trade', label: 'Compras e vendas' },
  { key: 'transfer', label: 'Transferências' },
  { key: 'income', label: 'Proventos' },
  { key: 'event', label: 'Eventos' },
] as const

export function HistoryTable({ data }: { data: HistoryResult }) {
  const router = useRouter()
  const params = useSearchParams()
  const query = useSearchScope('Buscar ativo no histórico')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * Apagar um lançamento, com confirmação.
   *
   * O texto nomeia o lançamento e diz o efeito real: a posição é recalculada
   * pelo ledger. Quem apaga uma compra precisa saber que o preço médio muda —
   * "tem certeza?" sozinho esconde justamente a consequência que importa.
   */
  function handleDelete(entry: HistoryEntry) {
    const ok = window.confirm(
      `Apagar ${entry.typeLabel} de ${entry.symbol} em ${entry.dateLabel}?\n\n` +
        'A posição é recalculada e a foto do dia refeita. Não tem volta.',
    )
    if (!ok) return

    setError(null)

    startTransition(async () => {
      const result = await deleteTransaction(entry.id)

      if (result.ok) router.refresh()
      else setError(result.error ?? 'Não foi possível apagar.')
    })
  }

  /**
   * Filtros na URL, não em estado local.
   *
   * Assim o filtro sobrevive ao recarregar, pode ser compartilhado por link, e
   * o botão voltar do navegador desfaz — três coisas que um `useState` não dá.
   */
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`/historico?${next.toString()}`)
  }

  const visible = useMemo(
    () =>
      data.entries.filter(
        (entry) => matches(entry.symbol, query) || matches(entry.name, query),
      ),
    [data.entries, query],
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Tipo">
          <Select value={params.get('group') ?? ''} onChange={(e) => setFilter('group', e.target.value)}>
            <option value="">Todos</option>
            {GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Classe">
          <Select
            value={params.get('classe') ?? ''}
            onChange={(e) => setFilter('classe', e.target.value)}
          >
            <option value="">Todas</option>
            {data.classes.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Carteira">
          <Select
            value={params.get('carteira') ?? ''}
            onChange={(e) => setFilter('carteira', e.target.value)}
          >
            <option value="">Todas</option>
            {data.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="De">
          <Input
            type="date"
            value={params.get('de') ?? ''}
            onChange={(e) => setFilter('de', e.target.value)}
          />
        </Field>

        <Field label="Até">
          <Input
            type="date"
            value={params.get('ate') ?? ''}
            onChange={(e) => setFilter('ate', e.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <p className="rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight size={22} strokeWidth={1.8} />}
          title="Nenhum lançamento"
          description={
            data.entries.length === 0
              ? 'Compras, vendas, transferências e proventos aparecem aqui assim que forem registrados.'
              : 'Nenhum lançamento corresponde aos filtros.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-[1.6fr_1.1fr_1fr_0.9fr_1fr_64px] gap-4 border-b border-line px-5 py-3">
            <span className="text-caption uppercase text-fg-subtle">Ativo</span>
            <span className="text-caption uppercase text-fg-subtle">Lançamento</span>
            <span className="text-caption uppercase text-fg-subtle">Carteira</span>
            <span className="text-right text-caption uppercase text-fg-subtle">Quantidade</span>
            <span className="text-right text-caption uppercase text-fg-subtle">Valor</span>
            <span className="text-right text-caption uppercase text-fg-subtle">Ações</span>
          </div>

          <div className="divide-y divide-line">
            {visible.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onDelete={handleDelete}
                pending={pending}
              />
            ))}
          </div>

          {data.total >= 500 ? (
            <p className="border-t border-line px-5 py-3 text-caption normal-case tracking-normal text-fg-subtle">
              Mostrando os 500 lançamentos mais recentes. Refine o período para ver os
              anteriores.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function HistoryRow({
  entry,
  onDelete,
  pending,
}: {
  entry: HistoryEntry
  onDelete: (entry: HistoryEntry) => void
  pending: boolean
}) {
  // Provento automático não tem ação: apagar não adianta, porque a próxima
  // sincronização o recria. Mostrar o botão e recusar depois seria pior do que
  // não mostrar.
  const editavel = entry.source !== 'AUTO_CORPORATE_ACTION'

  const Icon =
    entry.group === 'transfer'
      ? ArrowLeftRight
      : entry.group === 'income'
        ? Coins
        : entry.group === 'event'
          ? Split
          : entry.direction === 'in'
            ? TrendingUp
            : TrendingDown

  // Verde e vermelho aqui são semânticos: entrada e saída de caixa.
  // Transferência é neutra de propósito — não move dinheiro, só de lugar.
  const tone =
    entry.direction === 'in'
      ? 'text-positive'
      : entry.direction === 'out'
        ? 'text-negative'
        : 'text-fg-muted'

  return (
    <div className="grid grid-cols-[1.6fr_1.1fr_1fr_0.9fr_1fr_64px] items-center gap-4 px-5 py-3 transition-colors duration-[180ms] hover:bg-raised/50">
      <div className="flex min-w-0 items-center gap-2.5">
        <AssetAvatar
          symbol={entry.symbol}
          name={entry.name}
          logoUrl={entry.logoUrl}
          classSlug={entry.classSlug}
          size={28}
        />
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-medium text-fg">{entry.symbol}</p>
          <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
            {entry.dateLabel}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Icon size={14} strokeWidth={2} className={cn('shrink-0', tone)} />
        <span className="truncate text-[0.8125rem] text-fg-muted">{entry.typeLabel}</span>
        {entry.source === 'AUTO_CORPORATE_ACTION' ? (
          <Badge tone="accent">auto</Badge>
        ) : null}
      </div>

      <span className="truncate text-[0.8125rem] text-fg-subtle">{entry.walletName}</span>

      <span className="sensitive numeric text-right text-[0.8125rem] text-fg-muted">
        {entry.quantity ?? '—'}
      </span>

      <span className={cn('sensitive numeric text-right text-[0.8125rem] font-medium', tone)}>
        {entry.direction === 'out' ? '−' : entry.direction === 'in' ? '+' : ''}
        {entry.amount}
      </span>

      <span className="flex justify-end">
        {editavel ? (
          <button
            type="button"
            onClick={() => onDelete(entry)}
            disabled={pending}
            aria-label={`Apagar ${entry.typeLabel} de ${entry.symbol}`}
            title="Apagar lançamento"
            className="rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-[180ms] hover:border-negative/50 hover:text-negative disabled:opacity-40"
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
        ) : null}
      </span>
    </div>
  )
}
