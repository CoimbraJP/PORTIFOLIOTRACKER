'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Globe2, Play, TrendingUp } from 'lucide-react'
import { entrarComoDemo } from '@/server/actions/demo'
import { cn } from '@/lib/cn'

/**
 * Entrada rápida em carteiras prontas.
 *
 * Os dois perfis ficam ESCONDIDOS até alguém pedir. Três botões de entrada
 * lado a lado empatariam a decisão de quem só quer usar o produto — e a conta
 * de verdade é a que importa. Aberto, o contraste entre os perfis é o que
 * demonstra o sistema: um em reais com dividendo, outro em dólar.
 */
export function DemoButtons() {
  const [aberto, setAberto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carregando, setCarregando] = useState<'br' | 'us' | null>(null)
  const [pending, startTransition] = useTransition()

  function entrar(slug: 'br' | 'us') {
    setError(null)
    setCarregando(slug)

    startTransition(async () => {
      // Só retorna quando dá errado: no caminho feliz a ação redireciona.
      const result = await entrarComoDemo(slug)

      setCarregando(null)
      if (!result.ok) setError(result.error ?? 'Não consegui entrar na demonstração.')
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={cn(
          'flex w-full items-center justify-center gap-2.5 rounded-lg border border-line',
          'bg-surface px-4 py-3 text-sm font-medium text-fg',
          'transition-colors duration-[180ms] hover:border-accent/40',
        )}
      >
        <Play size={15} strokeWidth={2} />
        Demonstração
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={cn('transition-transform duration-[180ms]', aberto && 'rotate-180')}
        />
      </button>

      {aberto ? (
        <div className="mt-3 space-y-2">
          <PerfilButton
            icone={<TrendingUp size={15} strokeWidth={2} />}
            titulo="User 1 — Brasil"
            descricao="Ações, FIIs, renda fixa e imóvel"
            carregando={carregando === 'br'}
            disabled={pending}
            onClick={() => entrar('br')}
          />

          <PerfilButton
            icone={<Globe2 size={15} strokeWidth={2} />}
            titulo="User 2 — US"
            descricao="Ações e ETFs americanos, com cripto"
            carregando={carregando === 'us'}
            disabled={pending}
            onClick={() => entrar('us')}
          />

          <p className="pt-1 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
            Contas públicas com dados fictícios, compartilhadas por quem entrar. Não guarde nada
            de verdade nelas.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function PerfilButton({
  icone,
  titulo,
  descricao,
  carregando,
  disabled,
  onClick,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  carregando: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5',
        'text-left transition-colors duration-[180ms]',
        'hover:border-accent/40 disabled:opacity-50',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent">
        {icone}
      </span>

      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-fg">
          {carregando ? 'Preparando a carteira…' : titulo}
        </span>
        <span className="block text-caption normal-case tracking-normal text-fg-subtle">
          {descricao}
        </span>
      </span>
    </button>
  )
}
