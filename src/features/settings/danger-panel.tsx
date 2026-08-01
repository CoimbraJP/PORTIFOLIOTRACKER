'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { wipeTenantData, WIPE_PHRASE } from '@/server/actions/danger'

/**
 * Zona de perigo.
 *
 * Existe para a fase de testes, em que recomeçar do zero é rotina. A confirmação
 * é digitada, não clicada: um `confirm()` do navegador se aceita no reflexo, e
 * esta ação não tem volta.
 */
export function DangerPanel() {
  const router = useRouter()
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const armado = phrase.trim().toUpperCase() === WIPE_PHRASE

  function handleWipe() {
    setError(null)
    setDone(false)

    startTransition(async () => {
      const result = await wipeTenantData(phrase)

      if (result.ok) {
        setPhrase('')
        setDone(true)
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível apagar.')
      }
    })
  }

  return (
    <Card className="border-negative/25">
      <h2 className="text-[0.9375rem] font-semibold text-negative">Zona de perigo</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Apaga carteiras, ativos, lançamentos, avaliações, histórico e logos personalizados desta
        conta. Não tem volta. Cotações, catálogo e proventos de mercado ficam — são dados públicos,
        não patrimônio seu.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label={`Digite ${WIPE_PHRASE} para liberar`}>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={WIPE_PHRASE}
            className="w-48"
          />
        </Field>

        <Button variant="secondary" onClick={handleWipe} disabled={!armado || pending}>
          <Trash2 size={15} strokeWidth={2} />
          {pending ? 'Apagando…' : 'Apagar todos os dados'}
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      {done ? (
        <p className="mt-4 text-[0.8125rem] text-fg-muted">
          Dados apagados. A conta voltou ao estado inicial.
        </p>
      ) : null}
    </Card>
  )
}
