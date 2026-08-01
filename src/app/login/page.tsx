import { Suspense } from 'react'
import { FadeIn } from '@/components/motion/fade-in'
import { Skeleton } from '@/components/ui/skeleton'
import { LoginButton } from './login-button'

export const metadata = { title: 'Entrar · Patrimônio' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <FadeIn className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
            <span className="size-2 rounded-full bg-accent shadow-[var(--glow-dot)]" />
          </span>
          <span className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Patrimônio</span>
        </div>

        <h1 className="mt-8 text-[1.75rem] font-semibold tracking-[-0.02em] text-fg">
          Todos os seus ativos em um só lugar
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
          Ações, fundos, cripto, imóveis e empréstimos — consolidados, com o
          histórico preservado desde o primeiro lançamento.
        </p>

        {erro ? (
          <p className="mt-6 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
            Não foi possível entrar: {erro}
          </p>
        ) : null}

        <div className="mt-8">
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <LoginButton />
          </Suspense>
        </div>

        <p className="mt-6 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
          Ao entrar, uma área de trabalho é criada para você. Seus dados ficam
          isolados por tenant, com Row Level Security no banco.
        </p>
      </FadeIn>
    </div>
  )
}
