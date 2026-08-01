import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import type { Database } from '@/db/client'
import { tenant } from '@/db/schema'
import { seedAssetClasses } from './asset-classes'
import { seedDemoPortfolio } from './demo-portfolio'
import { seedQuotes, seedSnapshots } from './market-data'

config({ path: '.env.local' })

/**
 * Seed.
 *
 * Usa a conexão DIRETA e o papel `postgres`, que tem BYPASSRLS — as policies
 * têm FORCE ligado e barrariam até o dono da tabela. Isso é intencional: o seed
 * é operação de infraestrutura, não requisição de usuário.
 */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Defina DIRECT_URL em .env.local.')

  const client = postgres(url, { max: 1, prepare: false })
  const db = drizzle(client, { schema }) as Database

  try {
    console.log('Classes de sistema…')
    const classIdBySlug = await seedAssetClasses(db)
    console.log(`  ${classIdBySlug.size} classes prontas.`)

    const tenants = await db
      .select({ id: tenant.id, name: tenant.name })
      .from(tenant)
      .limit(2)

    if (tenants.length === 0) {
      console.log(
        '\nNenhum tenant no banco ainda.\n' +
          'Entre uma vez com o Google — o trigger cria o tenant — e rode o seed de novo\n' +
          'para popular a carteira de demonstração.',
      )
      return
    }

    if (tenants.length > 1) {
      console.log(
        '\nMais de um tenant encontrado. O seed de demonstração é para ambiente de\n' +
          'desenvolvimento com um usuário. Abortando para não escrever na conta errada.',
      )
      return
    }

    const target = tenants[0]!
    console.log(`\nCarteira de demonstração em "${target.name}"…`)
    const result = await seedDemoPortfolio(db, target.id, classIdBySlug)

    console.log(
      `  ${result.wallets} carteiras · ${result.positions} posições · ` +
        `${result.transactions} lançamentos.`,
    )

    const quotes = await seedQuotes(db)
    console.log(`  ${quotes} cotações.`)

    const snapshots = await seedSnapshots(db, target.id, result.walletIdByMockId)
    console.log(`  ${snapshots} snapshots diários.`)

    console.log('\nSeed concluído.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('\nSeed falhou:\n', error)
  process.exit(1)
})
