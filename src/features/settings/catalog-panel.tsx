'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BookMarked, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { syncCatalogNow, type CatalogResult } from '@/server/actions/sync'

/**
 * Carga do catálogo de tickers.
 *
 * O botão existe porque a primeira carga precisa acontecer antes do primeiro
 * cron — sem ela o autocomplete nasce vazio e parece quebrado. Depois disso, é
 * raro precisar: a lista de papéis da B3 muda algumas vezes por ano.
 */
export function CatalogPanel({ total }: { total: number }) {
  const router = useRouter()
  const [result, setResult] = useState<CatalogResult | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSync() {
    setResult(null)
    startTransition(async () => {
      setResult(await syncCatalogNow())
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Catálogo de ativos</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        A lista que alimenta as sugestões ao cadastrar um ativo. Vem da B3 (ações, FIIs, ETFs
        e BDRs), das 250 maiores criptomoedas e das ações e ETFs de NYSE e NASDAQ. Serve para
        você não cadastrar um código que não existe.
      </p>

      <p className="mt-4 text-caption normal-case tracking-normal text-fg-subtle">
        {total > 0
          ? `${total.toLocaleString('pt-BR')} ativos catalogados.`
          : 'Catálogo vazio — as sugestões só aparecem depois da primeira carga.'}
      </p>

      <div className="mt-5">
        <Button variant={total > 0 ? 'secondary' : 'primary'} onClick={handleSync} disabled={pending}>
          <BookMarked size={15} strokeWidth={2} />
          {pending ? 'Baixando…' : total > 0 ? 'Atualizar catálogo' : 'Montar catálogo'}
        </Button>
      </div>

      {result?.error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-[0.8125rem] text-positive">
            <Check size={14} strokeWidth={2.2} />
            {result.total.toLocaleString('pt-BR')} ativos catalogados
            {result.enriched > 0
              ? ` · ${result.enriched} da sua carteira ganharam logo ou identificador`
              : ''}
            .
          </p>

          {/* Uma fonte que falhou não zera as outras — o catálogo fica parcial
              em vez de vazio, e a linha abaixo diz exatamente qual faltou. */}
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
