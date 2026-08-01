import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

config({ path: '.env.local' })

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL

/**
 * Critério de pronto da Fase 2.
 *
 * Não basta a aplicação filtrar por `tenant_id`: o BANCO precisa recusar a
 * linha mesmo quando a query não filtra nada. É isso que estes testes provam,
 * e é a diferença entre ter RLS e ter RLS que funciona.
 *
 * Precisa de banco. Sem `DIRECT_URL`, a suíte é pulada em vez de falhar — CI
 * sem credencial não deve ficar vermelho por falta de infraestrutura.
 */
const suite = url ? describe : describe.skip

suite('isolamento entre tenants (RLS)', () => {
  const sql = postgres(url!, { max: 1, prepare: false })

  const userA = randomUUID()
  const userB = randomUUID()
  let tenantA = ''
  let tenantB = ''
  let classId = ''

  /** Roda uma query no papel do usuário, como a aplicação faz em `withRls`. */
  async function asUser<T>(userId: string, run: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
      await tx.unsafe(`select set_config('request.jwt.claims', '${claims}', true)`)
      await tx.unsafe('set local role authenticated')
      return run(tx)
    })
  }

  beforeAll(async () => {
    const [a] = await sql`
      insert into tenant (owner_user_id, name) values (${userA}, 'Tenant A') returning id
    `
    const [b] = await sql`
      insert into tenant (owner_user_id, name) values (${userB}, 'Tenant B') returning id
    `
    tenantA = a!.id
    tenantB = b!.id

    const [cls] = await sql`
      select id from asset_class where tenant_id is null limit 1
    `
    if (!cls) throw new Error('Rode `npm run db:seed` antes: faltam as classes de sistema.')
    classId = cls.id

    await sql`
      insert into wallet (tenant_id, asset_class_id, name, kind)
      values (${tenantA}, ${classId}, 'Carteira do A', 'BROKER'),
             (${tenantB}, ${classId}, 'Carteira do B', 'BROKER')
    `
  })

  afterAll(async () => {
    await sql`delete from wallet where tenant_id in (${tenantA}, ${tenantB})`
    await sql`delete from tenant where id in (${tenantA}, ${tenantB})`
    await sql.end()
  })

  it('a query sem filtro só devolve as linhas do próprio tenant', async () => {
    const rows = await asUser(userA, (tx) => tx`select name, tenant_id from wallet`)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('Carteira do A')
    expect(rows[0]!.tenant_id).toBe(tenantA)
  })

  it('filtrar explicitamente pelo tenant alheio devolve vazio', async () => {
    // O ataque óbvio: a aplicação é enganada e passa o tenant_id errado.
    const rows = await asUser(
      userA,
      (tx) => tx`select id from wallet where tenant_id = ${tenantB}`,
    )

    expect(rows).toHaveLength(0)
  })

  it('não é possível gravar dado em nome de outro tenant', async () => {
    await expect(
      asUser(
        userA,
        (tx) => tx`
          insert into wallet (tenant_id, asset_class_id, name, kind)
          values (${tenantB}, ${classId}, 'Invasão', 'BROKER')
        `,
      ),
    ).rejects.toThrow()
  })

  it('não é possível alterar linha de outro tenant', async () => {
    await asUser(
      userA,
      (tx) => tx`update wallet set name = 'Renomeada' where tenant_id = ${tenantB}`,
    )

    // O UPDATE não falha — simplesmente não encontra linha. Confirmamos que o
    // dado do B continua intacto.
    const [row] = await sql`select name from wallet where tenant_id = ${tenantB}`
    expect(row!.name).toBe('Carteira do B')
  })

  it('cada tenant enxerga o próprio recorte, nunca o do outro', async () => {
    const deA = await asUser(userA, (tx) => tx`select name from wallet`)
    const deB = await asUser(userB, (tx) => tx`select name from wallet`)

    expect(deA[0]!.name).toBe('Carteira do A')
    expect(deB[0]!.name).toBe('Carteira do B')
  })

  it('as classes de sistema continuam visíveis para todos', async () => {
    // tenant_id nulo é o caso especial: precisa passar, senão ninguém consegue
    // cadastrar nada.
    const rows = await asUser(
      userA,
      (tx) => tx`select count(*)::int as total from asset_class where tenant_id is null`,
    )

    expect(rows[0]!.total).toBeGreaterThan(0)
  })
})
