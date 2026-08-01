import 'server-only'

import { sql } from 'drizzle-orm'
import { getDb, type Database } from './client'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Executa consultas SOB o RLS, no papel do usuário.
 *
 * Por que isto existe: o Drizzle conecta com o papel `postgres`, que tem
 * BYPASSRLS. Sem este wrapper, todas as policies de `db/policies/0001_rls.sql`
 * seriam decoração — o banco devolveria linha de qualquer tenant e a única
 * proteção real seria o `where` da aplicação. Ou seja, a camada dupla que
 * docs/01 §3 promete deixaria de existir.
 *
 * A transação faz, nesta ordem:
 *   1. injeta `request.jwt.claims`, de onde `auth.uid()` lê o usuário;
 *   2. troca para o papel `authenticated`, que NÃO tem BYPASSRLS.
 *
 * Ambos em escopo local: ao fim da transação a conexão volta ao normal e pode
 * ser devolvida ao pool sem vazar contexto para a próxima requisição.
 */
export async function withRls<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`set local role authenticated`)
    return fn(tx)
  })
}

/**
 * Acesso privilegiado, sem RLS.
 *
 * Só para jobs e seed — nunca a partir de uma requisição de usuário. Existe
 * porque cotação, câmbio e evento corporativo são globais e precisam ser
 * escritos por processos sem usuário associado.
 */
export async function withServiceRole<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn)
}
