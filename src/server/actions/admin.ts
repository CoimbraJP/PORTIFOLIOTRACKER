'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/server/auth/admin-client'
import { isMaster, requireMaster } from '@/server/auth/master'
import { getSessionUser } from '@/server/auth/session'

export interface AdminResult {
  ok: boolean
  error?: string
}

/**
 * Remove uma conta e tudo que pertence a ela.
 *
 * Apagar o usuário em `auth.users` derruba o `tenant` por cascade, e o tenant
 * leva junto carteiras, posições, lançamentos e histórico. Uma chamada, nada
 * órfão para trás.
 *
 * Usa a API de administração em vez de um `delete` no banco: ela também encerra
 * as sessões ativas e limpa as identidades do OAuth. Apagar a linha na mão
 * deixaria a pessoa navegando com um token válido apontando para um usuário que
 * não existe mais.
 */
export async function deleteAccount(userId: string): Promise<AdminResult> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return { ok: false, error: 'Conta inválida.' }
  }

  try {
    // Dentro do try, e não antes: `requireMaster` lança um `Error` de verdade
    // (diferente de `requireTenant`, cujo `redirect()` o framework trata à
    // parte). Deixá-lo fora deixaria escapar sem o `{ ok: false }` que esta
    // action sempre promete — sessão de operador expirada no meio da tela
    // viraria um erro genérico em vez da mensagem de permissão.
    await requireMaster()

    // O operador não pode se apagar.
    //
    // Não é paternalismo: sem operador, ninguém mais administra o sistema, e a
    // recuperação exigiria mexer no banco na mão. Um clique errado não deveria
    // custar isso.
    const atual = await getSessionUser()
    if (atual?.id === userId) {
      return { ok: false, error: 'Você não pode apagar a própria conta por aqui.' }
    }

    const { error } = await createAdminClient().auth.admin.deleteUser(userId)
    if (error) throw new Error(error.message)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao apagar a conta.',
    }
  }

  revalidatePath('/admin')
  return { ok: true }
}

/** Se a administração está utilizável — operador logado e chave presente. */
export async function adminAvailable(): Promise<boolean> {
  return (await isMaster()) && Boolean(process.env.SUPABASE_SECRET_KEY)
}
