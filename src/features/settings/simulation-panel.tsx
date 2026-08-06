'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { carregarSimulacao, limparSimulacao } from '@/server/actions/simulation'

/**
 * Preenche a Renda Passiva sem depender de API paga.
 *
 * O aviso de que os proventos são simulados é o ponto do painel, não enfeite:
 * daqui a três meses ninguém vai lembrar que aquela renda de 2021 foi apurada
 * de um conjunto local, e renda inventada misturada à real é pior do que tela
 * vazia.
 */
export function SimulationPanel() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function carregar() {
    setError(null)
    setResumo(null)

    startTransition(async () => {
      const result = await carregarSimulacao()

      if (result.ok && result.report) {
        const r = result.report
        const ignorados =
          r.ignorados.length > 0 ? ` Sem dados para: ${r.ignorados.join(', ')}.` : ''

        setResumo(
          `${r.ativos} ativos cobertos · ${r.eventos} eventos de mercado · ` +
            `${r.proventos} recebimentos apurados.${ignorados}`,
        )
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível carregar a simulação.')
      }
    })
  }

  function limpar() {
    const ok = window.confirm(
      'Remover os proventos simulados?\n\n' +
        'Só os lançamentos de dividendo e JCP criados por aqui são apagados. ' +
        'Suas posições, quantidades e preços médios não são tocados.',
    )
    if (!ok) return

    setError(null)
    setResumo(null)

    startTransition(async () => {
      const result = await limparSimulacao()

      if (result.ok) {
        setResumo(`${result.removidos ?? 0} lançamentos removidos.`)
        router.refresh()
      } else {
        setError(result.error ?? 'Não foi possível limpar a simulação.')
      }
    })
  }

  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Simular proventos</h2>

      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Preenche a Renda Passiva com o histórico{' '}
        <strong className="font-medium text-fg-muted">real</strong> de dividendos e JCP das suas
        ações brasileiras desde 2020 — pesquisado em fontes públicas, não gerado. É o que a API
        paga responderia, calculado sobre as posições que você já tem.
      </p>

      <p className="mt-3 text-[0.8125rem] leading-relaxed text-fg-subtle">
        A apuração desfaz os desdobramentos para trás: quem tem 200 WEGE3 hoje tinha 100 antes do
        1:2 de 2021, e é sobre 100 que o dividendo daquele ano é calculado.
      </p>

      <p className="mt-3 text-caption normal-case leading-relaxed tracking-normal text-warning">
        Suas posições, quantidades e preços médios não são alterados — só entram lançamentos de
        provento, e eles saem inteiros no botão Remover.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={carregar} disabled={pending}>
          <FlaskConical size={15} strokeWidth={2} />
          {pending ? 'Apurando…' : 'Simular proventos'}
        </Button>

        <Button variant="ghost" onClick={limpar} disabled={pending}>
          <Trash2 size={15} strokeWidth={2} />
          Remover
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      {resumo ? <p className="mt-4 text-[0.8125rem] text-fg-muted">{resumo}</p> : null}
    </Card>
  )
}
