'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { tenant } from '@/db/schema'
import { createSupabaseServerClient } from '@/server/auth/supabase'
import { toAuthEmail } from '@/server/validation/credentials'
import { demoJaSemeado, semearDemo } from '@/server/simulation/demo-seed'
import { perfilDemo } from '@/server/simulation/demo-portfolios'

export interface DemoResult {
  ok: boolean
  error?: string
}

/**
 * Senha das contas de demonstração.
 *
 * Fixa e previsível de propósito: a conta É pública, qualquer visitante entra
 * nela com um clique. Esconder a senha não protegeria nada — o botão faz o
 * login sozinho. O que importa é que estas contas nunca contenham dado real,
 * e por isso são criadas separadas das dos usuários.
 *
 * Configurável para quem publicar uma instância própria e quiser desativar a
 * demonstração trocando a senha por algo que o botão não conhece.
 */
function senhaDemo(): string {
  return process.env.DEMO_PASSWORD?.trim() || 'demo-patrimonio-2026'
}

const USUARIOS: Record<'br' | 'us', string> = {
  br: 'demo.brasil',
  us: 'demo.global',
}

/**
 * Entra numa conta de demonstração e monta a carteira, se ainda não existir.
 *
 * A conta é compartilhada: dois visitantes ao mesmo tempo veem os mesmos
 * dados, e o que um alterar o outro enxerga. É aceitável porque a alternativa
 * — criar uma conta descartável por visita — encheria o banco de tenants
 * órfãos para sempre.
 *
 * A montagem é idempotente e só roda quando a conta está vazia. Sem isso, cada
 * entrada empilharia outra carteira por cima da anterior.
 */
export async function entrarComoDemo(slug: 'br' | 'us'): Promise<DemoResult> {
  if (slug !== 'br' && slug !== 'us') {
    return { ok: false, error: 'Perfil de demonstração desconhecido.' }
  }

  try {
    const perfil = perfilDemo(slug)
    const email = toAuthEmail(USUARIOS[slug])
    const password = senhaDemo()
    const supabase = await createSupabaseServerClient()

    let { error } = await supabase.auth.signInWithPassword({ email, password })

    // Primeira vez nesta instalação: a conta ainda não existe. Cria e entra.
    if (error) {
      const { error: erroCadastro } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: perfil.nome, username: USUARIOS[slug], demo: true } },
      })

      if (erroCadastro) {
        return { ok: false, error: `Não consegui criar a conta de demonstração: ${erroCadastro.message}` }
      }

      ;({ error } = await supabase.auth.signInWithPassword({ email, password }))
      if (error) return { ok: false, error: 'A conta de demonstração foi criada, mas o login falhou.' }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Não consegui confirmar a sessão de demonstração.' }

    // O tenant nasce de um gatilho no banco, disparado pelo cadastro. Se ele
    // não rodou, montar a carteira agora gravaria em lugar nenhum.
    const [row] = await getDb()
      .select({ id: tenant.id })
      .from(tenant)
      .where(eq(tenant.ownerUserId, user.id))
      .limit(1)

    if (!row) {
      return { ok: false, error: 'A conta de demonstração entrou, mas ainda não tem área de trabalho.' }
    }

    if (!(await demoJaSemeado(row.id))) {
      await semearDemo(row.id, slug)
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não consegui entrar na demonstração.',
    }
  }

  // Fora do try: `redirect` funciona lançando, e capturá-lo aqui transformaria
  // um login bem-sucedido numa mensagem de erro.
  redirect('/')
}
