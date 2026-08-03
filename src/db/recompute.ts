import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { isNull } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import type { Database } from '@/db/client'
import { position } from '@/db/schema'
import { recomputePosition } from '@/server/services/recompute-position'

config({ path: '.env.local' })

/**
 * Reconstrói TODAS as colunas derivadas a partir do ledger.
 *
 * Existe porque `quantity`, `avg_price`, `total_cost` e `total_invested` são
 * cache — a fonte da verdade são os lançamentos (CLAUDE.md §2.1). Cache que
 * não pode ser refeito não é cache, é dado; e a primeira vez que isso importa é
 * agora: uma coluna nova nasce com o valor padrão e fica mentindo até alguém
 * recalcular.
 *
 * É seguro rodar quantas vezes quiser. Não escreve lançamento nenhum: só relê o
 * que já existe e regrava o resumo. Se o resultado mudar, é porque o resumo
 * estava errado.
 *
 * Usa a conexão DIRETA com o papel `postgres`, que tem BYPASSRLS: as policies
 * têm FORCE ligado e barrariam até o dono da tabela. É operação de
 * infraestrutura, não requisição de usuário.
 */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Defina DIRECT_URL em .env.local.')

  const client = postgres(url, { max: 1, prepare: false })
  const db = drizzle(client, { schema }) as Database

  try {
    const alvos = await db
      .select({ id: position.id })
      .from(position)
      .where(isNull(position.deletedAt))

    console.log(`Recalculando ${alvos.length} posições a partir do ledger…`)

    let feitas = 0

    for (const alvo of alvos) {
      // Uma transação por posição, não uma para todas: um erro numa posição
      // isolada não deve desfazer o trabalho já correto das outras, e o
      // relatório final diz exatamente onde parou.
      await db.transaction((tx) => recomputePosition(tx, alvo.id))
      feitas += 1

      if (feitas % 25 === 0) console.log(`  ${feitas}/${alvos.length}`)
    }

    console.log(`\n${feitas} posições recalculadas.`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
