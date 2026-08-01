import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })

/**
 * Aplica os arquivos de `db/policies/` em ordem.
 *
 * Separado das migrations do drizzle-kit de propósito: RLS, funções e triggers
 * são SQL que o gerador de schema não produz nem entende. Todo arquivo é
 * idempotente, então rodar de novo é seguro.
 *
 * Usa a conexão DIRETA: o pgBouncer em modo transaction não aceita o DDL daqui.
 */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('Defina DIRECT_URL em .env.local (conexão direta, porta 5432).')
  }

  const dir = join(process.cwd(), 'src', 'db', 'policies')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  if (files.length === 0) {
    console.log('Nenhum arquivo .sql em src/db/policies.')
    return
  }

  const sql = postgres(url, { max: 1, prepare: false })

  try {
    for (const file of files) {
      const content = await readFile(join(dir, file), 'utf8')
      process.stdout.write(`  aplicando ${file} … `)
      await sql.unsafe(content)
      console.log('ok')
    }
    console.log('\nPolicies aplicadas.')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error('\nFalhou ao aplicar policies:\n', error)
  process.exit(1)
})
