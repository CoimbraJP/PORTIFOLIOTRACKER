import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Cliente com poder total, para as ações do operador.
 *
 * A chave `service_role` ignora TODO o RLS. Ela existe aqui por um motivo
 * específico: listar e remover contas de autenticação é coisa que nenhuma
 * policy permite ao próprio usuário, e nem deveria.
 *
 * Três cuidados que não são negociáveis:
 *
 * 1. Jamais com prefixo `NEXT_PUBLIC_`. Com ele a chave iria para o browser e
 *    qualquer visitante leria e apagaria o banco inteiro.
 * 2. `server-only` no topo do arquivo: se algum dia um componente de cliente
 *    importar isto por engano, o build QUEBRA em vez de vazar.
 * 3. Sem sessão persistida — este cliente não representa ninguém, é uma
 *    ferramenta administrativa.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url || !secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY não configurada. A administração de contas precisa dela.',
    )
  }

  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
