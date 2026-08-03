'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull, or } from 'drizzle-orm'
import { money } from '@/core/money/decimal'
import { convertMoney } from '@/core/money/display'
import { assetClass as assetClassConfig } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import { assetClass, position, transaction, valuation, wallet } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { dailySnapshotJob } from '@/server/jobs/daily-snapshot'
import { findInCatalog } from '@/server/services/catalog-lookup'
import { recomputePosition } from '@/server/services/recompute-position'
import { resolvePosition } from '@/server/services/resolve-position'
import { newPositionSchema } from '@/server/validation/position'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Adiciona um ativo a uma carteira.
 *
 * Grava uma TRANSAÇÃO de compra e manda recalcular. Em nenhum momento este
 * código decide qual é a quantidade ou o preço médio da posição — quem responde
 * isso é o motor de ledger. Ver CLAUDE.md §2.1.
 *
 * Tudo numa transação só: carteira, instrumento, posição, lançamento e
 * recálculo. Falha no meio não pode deixar uma posição sem a compra que a
 * originou.
 */
export async function createPosition(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = newPositionSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Dados inválidos.' }
  }

  const input = parsed.data
  const slug = input.classSlug as AssetClassSlug
  const definition = assetClassConfig(slug)

  // Instrumento é COMPARTILHADO entre tenants — é o que faz a cotação do PETR4
  // ser buscada uma vez e servir todo mundo. Só entra no acervo comum o que o
  // catálogo conhece: símbolo vindo da B3, da CoinGecko ou da Twelve Data é
  // fato de mercado.
  //
  // Ticker que o catálogo não conhece vira instrumento PRIVADO do tenant. Não é
  // punição a quem cadastra ativo obscuro: é que um erro de digitação não pode
  // sujar o acervo dos outros usuários, e "KLBN44" no acervo comum ficaria lá
  // para sempre. Privado, o estrago é de quem digitou e some quando ele apagar.
  //
  // A verificação é do SERVIDOR. O formulário já pergunta, mas confiar nele
  // deixaria a decisão nas mãos de quem manda a requisição.
  const catalogo = definition.privateInstrument
    ? null
    : await findInCatalog(slug, input.symbol)

  try {
    await withRls(context.user.id, async (tx) => {
      const occurredAt = input.occurredAt ?? new Date().toISOString().slice(0, 10)

      const { positionId } = await resolvePosition(
        tx,
        context.tenantId,
        {
          classSlug: slug,
          walletId: input.walletId,
          walletName: input.newWalletName,
          symbol: input.symbol,
          name: input.name,
          openedAt: occurredAt,
        },
        catalogo,
      )

      // --- lançamento -----------------------------------------------------
      //
      // Um ativo internacional é digitado em dólar, mas o LEDGER vive em reais.
      // O custo é convertido pelo câmbio do dia da compra e é assim que ele
      // fica para sempre — é o que a Receita considera e o que descreve quanto
      // o patrimônio realmente cresceu. Nada se perde: o lançamento guarda a
      // moeda digitada e a taxa aplicada, então o valor original em dólar é
      // sempre `unit_price / fx_rate`.
      if (input.entryCurrency === 'USD' && !definition.foreignEntry) {
        throw new Error(`${definition.name} não aceita lançamento em dólar.`)
      }

      const rate = input.entryCurrency === 'USD' ? money(input.entryRate ?? '0') : money(1)

      if (rate.isZero() || rate.isNegative()) {
        throw new Error('Informe a cotação do dólar na data da compra.')
      }

      const quantity = money(input.quantity)
      const unitCost = convertMoney(money(input.unitCost), input.entryCurrency, 'BRL', rate)
      const gross = quantity.times(unitCost)

      await tx.insert(transaction).values({
        tenantId: context.tenantId,
        positionId,
        type: 'BUY',
        occurredAt: new Date(`${occurredAt}T12:00:00Z`),
        quantity: quantity.toFixed(10),
        unitPrice: unitCost.toFixed(10),
        grossAmount: gross.toFixed(10),
        netAmount: gross.toFixed(10),
        currency: input.entryCurrency,
        fxRate: rate.toFixed(10),
        source: 'MANUAL',
        idempotencyKey: `manual:${randomUUID()}`,
      })

      // --- valor informado -------------------------------------------------
      //
      // O usuário disse quanto vale hoje. Para onde isso é gravado depende do
      // que a classe É:
      //
      // QUANTITATIVE (ação, cripto…) tem cotação de MERCADO, que é dado
      // GLOBAL — a mesma linha serve a todo mundo que tem PETR4. Escrever ali
      // é papel do job de sincronização, com service role (ver `withRls` e
      // `withServiceRole` em `db/rls.ts`): esta transação roda como o papel
      // `authenticated`, para o qual a tabela `quote` não tem policy de
      // escrita nenhuma — de propósito, para que uma requisição de usuário
      // nunca escreva no acervo global. Um valor digitado aqui não entra;
      // a sincronização automática assume assim que o instrumento for
      // reconhecido, e até lá a posição usa o próprio custo (lucro zero).
      //
      // VALUATED e ACCRUAL (imóvel, empresa, empréstimo…) não têm mercado —
      // o valor é uma OPINIÃO do tenant sobre o próprio bem, e é exatamente
      // isso que a tabela `valuation` modela. É tenant-scoped, então a
      // escrita é permitida, e é a mesma tabela que "Novo saldo" usa depois
      // de criado (`server/actions/transaction.ts`).
      if (input.unitValue && definition.valuationMode !== 'QUANTITATIVE') {
        await tx.insert(valuation).values({
          tenantId: context.tenantId,
          positionId,
          valuedAt: occurredAt,
          value: money(input.unitValue).toFixed(10),
          currency: input.entryCurrency,
          method: 'MANUAL',
        })
      }

      // --- taxa de juros do contrato ----------------------------------------
      //
      // Só empréstimo e renda fixa têm taxa. Fica em `custom_fields`, de onde
      // `readAccrualFields` lê para projetar o valor por juros compostos
      // sempre que ainda não houver uma reavaliação manual mais recente.
      if (definition.valuationMode === 'ACCRUAL' && input.rate) {
        await tx
          .update(position)
          .set({
            customFields: {
              rate: input.rate,
              startDate: occurredAt,
              ratePeriod: slug === 'emprestimos' ? 'MONTHLY' : 'YEARLY',
            },
          })
          .where(eq(position.id, positionId))
      }

      await recomputePosition(tx, positionId)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return { ok: false, error: message }
  }

  revalidatePath('/')
  revalidatePath('/carteiras')
  revalidatePath(`/carteiras/${slug}`)

  return { ok: true }
}

/**
 * Apaga um ativo e tudo que pende dele.
 *
 * Apagado DE VERDADE, não arquivado — exceção deliberada à regra de soft delete
 * (CLAUDE.md §2.9). O motivo é que a regra existe para preservar patrimônio, e
 * um erro de digitação não é patrimônio: é entulho que ninguém vai querer
 * auditar depois. Lançamento, avaliação e anexo saem junto por cascade.
 *
 * O soft delete continua valendo para o resto: encerrar uma posição vendida é
 * fato econômico e permanece no histórico.
 */
export async function deletePosition(positionId: string): Promise<ActionResult> {
  const context = await requireTenant()

  if (!/^[0-9a-f-]{36}$/i.test(positionId)) {
    return { ok: false, error: 'Ativo inválido.' }
  }

  try {
    await withRls(context.user.id, async (tx) => {
      // O RLS já barra posição de outro tenant; o `tenantId` no `where` é a
      // segunda camada, para o caso de a policy ser afrouxada um dia.
      const [alvo] = await tx
        .delete(position)
        .where(and(eq(position.id, positionId), eq(position.tenantId, context.tenantId)))
        .returning({ id: position.id })

      if (!alvo) throw new Error('Ativo não encontrado.')
    })

    // A foto de hoje já pode ter sido tirada COM o valor errado, e snapshot não
    // se recalcula sozinho. Sem isto, apagar a posição limparia as telas e
    // deixaria o pico no gráfico de evolução para sempre — no único lugar onde
    // o usuário não olharia para conferir.
    await dailySnapshotJob()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Carteiras da classe, para o seletor do formulário. */
export async function listWallets(slug: string) {
  const context = await requireTenant()

  return withRls(context.user.id, (tx) =>
    tx
      .select({ id: wallet.id, name: wallet.name })
      .from(wallet)
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(
        and(
          eq(assetClass.slug, slug),
          isNull(wallet.deletedAt),
          or(isNull(assetClass.tenantId), eq(assetClass.tenantId, context.tenantId)),
        ),
      ),
  )
}
