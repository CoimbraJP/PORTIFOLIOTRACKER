'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Bitcoin, CameraIcon, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { snapshotNow, syncCryptoNow, syncNow, type SyncNowResult } from '@/server/actions/sync'
import { cn } from '@/lib/cn'

export function SyncPanel({ lastQuoteAt }: { lastQuoteAt: string | null }) {
  const router = useRouter()
  const [result, setResult] = useState<SyncNowResult | null>(null)
  const [snapshotDone, setSnapshotDone] = useState(false)
  const [pending, startTransition] = useTransition()

  /** `escopo` só muda o rótulo do botão que está girando. */
  const [escopo, setEscopo] = useState<'tudo' | 'cripto' | null>(null)

  function handleSync(apenasCripto = false) {
    setResult(null)
    setSnapshotDone(false)
    setEscopo(apenasCripto ? 'cripto' : 'tudo')

    startTransition(async () => {
      setResult(await (apenasCripto ? syncCryptoNow() : syncNow()))
      setEscopo(null)
      router.refresh()
    })
  }

  function handleSnapshot() {
    setResult(null)
    startTransition(async () => {
      const outcome = await snapshotNow()
      setSnapshotDone(outcome.ok)
      if (!outcome.ok) {
        setResult({
          ok: false,
          updated: 0,
          logos: 0,
          unresolved: [],
          warnings: [],
          error: outcome.error,
        })
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Cotações</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Os preços vêm da CoinGecko (cripto) e da BRAPI (ações, FIIs e ETFs). O câmbio
        USD/BRL vem do Banco Central. Ativos sem provider — imóveis, empresas e empréstimos —
        continuam com o valor que você informou.
      </p>
      <p className="mt-2 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
        Cripto negocia fim de semana e madrugada, e a CoinGecko não cobra cota como as outras.
        Por isso o botão separado: dá para atualizar as moedas o dia inteiro sem gastar o limite
        da BRAPI e da Twelve Data, que só muda até as 18h.
      </p>

      <p className="mt-4 text-caption normal-case tracking-normal text-fg-subtle">
        {lastQuoteAt
          ? `Última cotação gravada em ${formatDateTime(lastQuoteAt)}.`
          : 'Nenhuma cotação gravada ainda.'}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => handleSync()} disabled={pending}>
          <RefreshCw size={15} strokeWidth={2} className={cn(escopo === 'tudo' && 'animate-spin')} />
          {escopo === 'tudo' ? 'Consultando…' : 'Cotar agora'}
        </Button>

        <Button variant="secondary" onClick={() => handleSync(true)} disabled={pending}>
          <Bitcoin size={15} strokeWidth={2} className={cn(escopo === 'cripto' && 'animate-spin')} />
          {escopo === 'cripto' ? 'Consultando…' : 'Cotar só criptos'}
        </Button>

        <Button variant="secondary" onClick={handleSnapshot} disabled={pending}>
          <CameraIcon size={15} strokeWidth={2} />
          Gravar foto de hoje
        </Button>
      </div>

      {snapshotDone ? (
        <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-positive">
          <Check size={14} strokeWidth={2.2} />
          Foto de hoje gravada no histórico.
        </p>
      ) : null}

      {result?.error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-[0.8125rem] text-positive">
            <Check size={14} strokeWidth={2.2} />
            {result.updated === 0
              ? 'Nenhum preço novo — nada a atualizar.'
              : `${result.updated} ${result.updated === 1 ? 'cotação atualizada' : 'cotações atualizadas'}`}
            {result.logos > 0 ? ` · ${result.logos} logos` : ''}
          </p>

          {result.unresolved.length > 0 ? (
            <p className="text-[0.8125rem] text-fg-subtle">
              Sem cotação: {result.unresolved.join(', ')}
            </p>
          ) : null}

          {result.warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-warning"
            >
              <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
