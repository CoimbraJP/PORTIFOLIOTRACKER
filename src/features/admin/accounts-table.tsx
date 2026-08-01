'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldOff, Trash2, User } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { deleteAccount } from '@/server/actions/admin'
import type { AccountRow } from '@/server/queries/accounts'
import { cn } from '@/lib/cn'

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete(account: AccountRow) {
    const nome = account.username ?? account.email ?? account.tenantName

    const ok = window.confirm(
      `Apagar a conta de ${nome}?\n\n` +
        `${account.positions} ativos e ${account.transactions} lançamentos serão apagados junto. ` +
        'Não tem volta.',
    )
    if (!ok) return

    setError(null)
    setAlvo(account.userId)

    startTransition(async () => {
      const result = await deleteAccount(account.userId)
      setAlvo(null)

      if (result.ok) router.refresh()
      else setError(result.error ?? 'Não foi possível apagar.')
    })
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-fg">
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}
        </h2>
        <span className="text-caption normal-case tracking-normal text-fg-subtle">
          {accounts.filter((a) => a.anonymous).length} sem identificação
        </span>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      <div className="mt-4 divide-y divide-line">
        {accounts.map((account) => (
          <div key={account.userId} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border',
                account.anonymous
                  ? 'border-line bg-raised text-fg-subtle'
                  : 'border-accent/25 bg-accent/10 text-accent',
              )}
            >
              {account.anonymous ? (
                <ShieldOff size={14} strokeWidth={2} />
              ) : (
                <User size={14} strokeWidth={2} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium text-fg">
                {account.username ?? account.email ?? '—'}
              </p>
              <p className="truncate text-caption normal-case tracking-normal text-fg-subtle">
                {account.tenantName} · criada em {formatarData(account.createdAt)}
                {account.lastSignInAt
                  ? ` · último acesso ${formatarData(account.lastSignInAt)}`
                  : ' · nunca acessou'}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="numeric text-[0.8125rem] text-fg-muted">{account.positions} ativos</p>
              <p className="numeric text-caption normal-case tracking-normal text-fg-subtle">
                {account.transactions} lançamentos
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleDelete(account)}
              disabled={pending}
              aria-label={`Apagar conta de ${account.username ?? account.email}`}
              className="shrink-0 rounded-sm border border-line p-1.5 text-fg-subtle transition-colors duration-[180ms] hover:border-negative/50 hover:text-negative disabled:opacity-40"
            >
              <Trash2 size={13} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>

      {pending && alvo ? (
        <p className="mt-4 text-[0.8125rem] text-fg-subtle">Apagando…</p>
      ) : null}
    </Card>
  )
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}
