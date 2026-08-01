import 'server-only'

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

const globalForDb = globalThis as unknown as {
  __pgClient?: postgres.Sql
  __db?: Database
}

/**
 * Conexão preguiçosa, de propósito.
 *
 * Se a conexão fosse criada no topo do módulo, importar este arquivo exigiria
 * `DATABASE_URL` — e o `next build` avalia o grafo de módulos de toda página
 * antes de qualquer requisição. O build passaria a depender de credencial de
 * banco, o que quebra CI e deploy de preview sem motivo.
 *
 * `prepare: false` é obrigatório com o pgBouncer em modo transaction: prepared
 * statements não sobrevivem ao reaproveitamento de conexão.
 *
 * Em desenvolvimento o cliente fica no globalThis para o hot reload não abrir
 * uma conexão nova a cada salvamento e esgotar o pool.
 */
export function getDb(): Database {
  if (globalForDb.__db) return globalForDb.__db

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env.local.')
  }

  const client =
    globalForDb.__pgClient ??
    postgres(url, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
    })

  const database = drizzle(client, { schema })

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__pgClient = client
    globalForDb.__db = database
  }

  return database
}

export { schema }
