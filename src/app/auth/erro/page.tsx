import { AlertTriangle } from 'lucide-react'
import { SignOutButton } from './sign-out-button'

const MOTIVOS: Record<string, { titulo: string; texto: string }> = {
  'sem-tenant': {
    titulo: 'Conta autenticada, mas sem carteira',
    texto:
      'Você entrou pelo Google, mas nenhuma carteira foi criada para esta conta. Isso acontece quando o gatilho de cadastro do banco não rodou. Saia e entre de novo; se persistir, é preciso reaplicar as policies no banco.',
  },
}

/**
 * Onde o usuário autenticado sem tenant aterrissa.
 *
 * Esta rota existe para quebrar um laço: `requireTenant` mandava para `/login`,
 * e o middleware, vendo um usuário logado em `/login`, mandava de volta para
 * `/`. O navegador ia e voltava até desistir, e o sintoma era "o login não faz
 * nada" — sem nenhuma pista do motivo real.
 *
 * `/auth/erro` é rota pública no middleware, então nada a redireciona.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  const info = MOTIVOS[motivo ?? ''] ?? {
    titulo: 'Não foi possível continuar',
    texto: 'A sessão existe, mas o acesso não pôde ser resolvido. Saia e entre novamente.',
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-warning/25 bg-warning/10 text-warning">
        <AlertTriangle size={20} strokeWidth={1.8} />
      </span>

      <div>
        <h1 className="text-lg font-semibold text-fg">{info.titulo}</h1>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">{info.texto}</p>
      </div>

      <SignOutButton />
    </main>
  )
}
