import { FadeIn } from '@/components/motion/fade-in'
import { CredentialsForm } from '../credentials-form'

export const metadata = { title: 'Entrar sem identificação · Patrimônio' }

/**
 * Acesso por usuário e senha, sem pedir dado pessoal.
 *
 * O modo vem da URL, e não de estado local, para que o botão de voltar do
 * navegador funcione entre "entrar" e "criar conta" — e para que o link de
 * cadastro possa ser compartilhado direto.
 */
export default async function SenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ criar?: string }>
}) {
  const { criar } = await searchParams
  const mode = criar ? 'criar' : 'entrar'

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
          {mode === 'criar' ? 'Criar conta sem identificação' : 'Entrar sem identificação'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
          {mode === 'criar'
            ? 'Nenhum dado pessoal é pedido. Escolha um usuário e uma senha — o e-mail é opcional e serve só para recuperar o acesso.'
            : 'Use o usuário que você escolheu, ou o e-mail se tiver informado um.'}
        </p>

        <div className="mt-8">
          <CredentialsForm mode={mode} />
        </div>
      </FadeIn>
    </div>
  )
}
