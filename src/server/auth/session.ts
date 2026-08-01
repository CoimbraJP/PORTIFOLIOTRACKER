import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { tenant } from '@/db/schema'
import { createSupabaseServerClient } from './supabase'
import type { SessionUser, TenantContext } from './types'

export type { SessionUser, TenantContext }

/**
 * Usuário da requisição.
 *
 * Sempre `getUser()`, nunca `getSession()`: o segundo lê o cookie e acredita
 * nele, enquanto o primeiro valida o token no servidor de auth. Cookie é dado
 * que veio do cliente — confiar nele para decidir acesso é o mesmo erro de
 * confiar num `tenant_id` enviado pelo browser.
 *
 * `cache()` deduplica: vários Server Components na mesma árvore chamam esta
 * função e só uma validação acontece por requisição.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const meta = user.user_metadata ?? {}

  return {
    id: user.id,
    email: user.email ?? null,
    name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  }
})

/**
 * Contexto de tenant, resolvido no SERVIDOR a partir do usuário autenticado.
 *
 * Nunca aceita `tenantId` vindo do cliente. Esta é a única origem legítima do
 * tenant em toda a aplicação. Ver CLAUDE.md §2.3.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getSessionUser()
  if (!user) return null

  const [row] = await getDb()
    .select({ id: tenant.id, name: tenant.name, baseCurrency: tenant.baseCurrency })
    .from(tenant)
    .where(eq(tenant.ownerUserId, user.id))
    .limit(1)

  // Sem tenant apesar de autenticado: o trigger de signup não rodou. Tratar
  // como falta de acesso é mais honesto do que inventar um tenant vazio aqui.
  if (!row) return null

  return {
    user,
    tenantId: row.id,
    tenantName: row.name,
    baseCurrency: row.baseCurrency,
  }
})

/**
 * Versão que interrompe o render. Use nas páginas.
 *
 * Sem usuário vai para o login. COM usuário mas sem tenant vai para
 * `/auth/erro` — nunca para o login, porque o middleware devolveria um usuário
 * logado de `/login` para `/`, que cairia aqui de novo. O laço deixava a tela
 * piscando entre as duas rotas até o navegador desistir, e o sintoma era "o
 * login não faz nada", sem pista alguma do motivo.
 */
export async function requireTenant(): Promise<TenantContext> {
  const context = await getTenantContext()
  if (context) return context

  const user = await getSessionUser()
  redirect(user ? '/auth/erro?motivo=sem-tenant' : '/login')
}
