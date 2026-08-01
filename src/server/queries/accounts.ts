import 'server-only'

import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { requireMaster } from '@/server/auth/master'
import { usernameFromEmail } from '@/server/validation/credentials'

export interface AccountRow {
  userId: string
  tenantId: string | null
  /** Apelido, quando a conta é anônima. Nulo quando entrou por e-mail. */
  username: string | null
  /** Nulo em conta anônima — não existe e-mail real para mostrar. */
  email: string | null
  tenantName: string
  createdAt: string
  lastSignInAt: string | null
  positions: number
  transactions: number
  anonymous: boolean
}

/**
 * Todas as contas do sistema, para a tela do operador.
 *
 * Lê `auth.users` por SQL cru: o schema de autenticação é do Supabase, não
 * nosso, e mapeá-lo no Drizzle criaria a ilusão de que podemos escrever nele.
 * Aqui só se lê.
 *
 * Usa a conexão privilegiada de propósito — é a única consulta do sistema que
 * DEVE atravessar tenants. Por isso `requireMaster()` vem antes de tudo: se a
 * permissão fosse verificada só na tela, esta função continuaria sendo um
 * caminho aberto para quem soubesse chamá-la.
 */
export async function listAccounts(): Promise<AccountRow[]> {
  await requireMaster()

  const rows = await getDb().execute<{
    user_id: string
    email: string | null
    created_at: string
    last_sign_in_at: string | null
    tenant_id: string | null
    tenant_name: string | null
    positions: string
    transactions: string
  }>(sql`
    select
      u.id                                as user_id,
      u.email                             as email,
      u.created_at                        as created_at,
      u.last_sign_in_at                   as last_sign_in_at,
      t.id                                as tenant_id,
      t.name                              as tenant_name,
      coalesce(p.total, 0)                as positions,
      coalesce(x.total, 0)                as transactions
    from auth.users u
    left join public.tenant t on t.owner_user_id = u.id
    left join lateral (
      select count(*)::int as total
      from public.position
      where tenant_id = t.id and deleted_at is null
    ) p on true
    left join lateral (
      select count(*)::int as total
      from public.transaction
      where tenant_id = t.id and deleted_at is null
    ) x on true
    order by u.created_at desc
  `)

  return rows.map((row) => {
    const username = usernameFromEmail(row.email)

    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      username,
      // Conta anônima não tem e-mail para mostrar: o endereço interno é
      // detalhe de armazenamento, e exibi-lo sugeriria um contato que não
      // existe.
      email: username ? null : row.email,
      tenantName: row.tenant_name ?? '—',
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at,
      positions: Number(row.positions),
      transactions: Number(row.transactions),
      anonymous: username !== null,
    }
  })
}
