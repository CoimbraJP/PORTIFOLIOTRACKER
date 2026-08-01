'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { saveLogoOverride, type InstrumentLogoRow } from '@/server/actions/settings'
import { cn } from '@/lib/cn'

export function LogoPanel({ rows }: { rows: InstrumentLogoRow[] }) {
  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Logos dos ativos</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        O que a CoinGecko e a BRAPI encontraram vem preenchido. Imóveis, empresas e
        empréstimos não têm marca para buscar — ali o monograma é o visual definitivo,
        a menos que você aponte uma imagem.
      </p>
      <p className="mt-2 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
        A troca vale só para você. O catálogo de ativos é compartilhado entre todas as
        contas, então o logo que você definir não muda a tela de mais ninguém.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-[0.8125rem] text-fg-subtle">
          Nenhum ativo cadastrado ainda.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-line">
          {rows.map((row) => (
            <LogoRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </Card>
  )
}

function LogoRow({ row }: { row: InstrumentLogoRow }) {
  const router = useRouter()
  const [value, setValue] = useState(row.override ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const current = row.override ?? row.automatic
  const dirty = value !== (row.override ?? '')

  function submit(next: string) {
    setSaved(false)
    setError(null)

    startTransition(async () => {
      const result = await saveLogoOverride({ instrumentId: row.id, logoUrl: next })
      if (result.ok) {
        setSaved(true)
        setValue(next)
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível salvar.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full',
          'bg-elevated ring-1 ring-inset ring-line',
        )}
      >
        {current ? (
          <img src={current} alt="" width={36} height={36} className="size-full object-cover" />
        ) : (
          <span className="text-caption font-semibold text-fg-subtle">
            {row.symbol.slice(0, 3).toUpperCase()}
          </span>
        )}
      </span>

      <span className="w-32 shrink-0">
        <span className="block truncate text-[0.8125rem] font-medium text-fg">{row.symbol}</span>
        <span className="block truncate text-caption normal-case tracking-normal text-fg-subtle">
          {row.override ? 'personalizado' : row.automatic ? 'automático' : 'sem logo'}
        </span>
      </span>

      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={row.automatic ?? 'https://…/logo.png'}
        className="min-w-0 flex-1"
      />

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => submit(value.trim())}
          disabled={!dirty || pending}
        >
          Salvar
        </Button>

        {row.override ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => submit('')}
            disabled={pending}
            title="Voltar ao logo automático"
            aria-label="Voltar ao logo automático"
          >
            <RotateCcw size={14} strokeWidth={2} />
          </Button>
        ) : null}

        {saved && !dirty ? <Check size={14} strokeWidth={2.2} className="text-positive" /> : null}
      </div>

      {error ? (
        <p className="w-full text-caption normal-case tracking-normal text-negative">{error}</p>
      ) : null}
    </div>
  )
}
