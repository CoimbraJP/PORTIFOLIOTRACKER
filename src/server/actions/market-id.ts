'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { withRls } from '@/db/rls'
import { assetClass, instrument, position, wallet } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { marketIdSchema } from '@/server/validation/market-id'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Aponta qual moeda da CoinGecko é este ativo.
 *
 * Existe porque ticker de cripto colide. "FLUID" é o nome de mais de uma moeda,
 * e o catálogo — que guarda uma linha por símbolo — fica com a de maior valor de
 * mercado. Quem tem a outra vê um preço real, de um ativo real, que não é o
 * dele: dez vezes maior, plausível na tela, e sem nada indicando erro.
 *
 * A correção FORKA o instrumento. O global é compartilhado por todas as contas,
 * e reapontá-lo mudaria a cotação de estranhos por causa da carteira de um. O
 * ativo vira privado do tenant, com o id certo, e as posições dele passam a
 * apontar para o novo.
 *
 * O LEDGER não é tocado. Quantidade, custo e lucro vêm dos lançamentos, que
 * continuam os mesmos — o que muda é de onde vem o preço de mercado. Trocar o
 * instrumento não pode reescrever história.
 */
export async function setMarketId(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = marketIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { positionId, coingeckoId } = parsed.data

  try {
    await withRls(context.user.id, async (tx) => {
      const [alvo] = await tx
        .select({
          instrumentId: instrument.id,
          symbol: instrument.symbol,
          name: instrument.name,
          kind: instrument.kind,
          currency: instrument.currency,
          isGlobal: instrument.isGlobal,
          externalIds: instrument.externalIds,
          classSlug: assetClass.slug,
        })
        .from(position)
        .innerJoin(instrument, eq(position.instrumentId, instrument.id))
        .innerJoin(wallet, eq(position.walletId, wallet.id))
        .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
        .where(
          and(
            eq(position.id, positionId),
            eq(position.tenantId, context.tenantId),
            isNull(position.deletedAt),
          ),
        )
        .limit(1)

      if (!alvo) throw new Error('Ativo não encontrado.')
      if (alvo.classSlug !== 'cripto') {
        throw new Error('Só cripto é identificada por id da CoinGecko.')
      }

      const externalIds = { ...(alvo.externalIds as Record<string, string>), coingecko: coingeckoId }

      // Instrumento já privado é editado no lugar: ele é só desta conta.
      if (!alvo.isGlobal) {
        await tx
          .update(instrument)
          .set({ externalIds })
          .where(eq(instrument.id, alvo.instrumentId))
        return
      }

      // Reaproveita o privado que já exista com este símbolo. Sem isto, corrigir
      // duas carteiras com a mesma moeda esbarraria no índice único de símbolo
      // por tenant.
      const [existente] = await tx
        .select({ id: instrument.id })
        .from(instrument)
        .where(
          and(
            eq(instrument.symbol, alvo.symbol),
            eq(instrument.tenantId, context.tenantId),
            eq(instrument.isGlobal, false),
          ),
        )
        .limit(1)

      const novoId =
        existente?.id ??
        (
          await tx
            .insert(instrument)
            .values({
              tenantId: context.tenantId,
              isGlobal: false,
              symbol: alvo.symbol,
              name: alvo.name,
              kind: alvo.kind,
              currency: alvo.currency,
              externalIds,
              // Logo fica nulo de propósito: o do global era da moeda errada, e
              // a próxima sincronização traz o certo junto com o preço.
            })
            .returning({ id: instrument.id })
        )[0]!.id

      if (existente) {
        await tx.update(instrument).set({ externalIds }).where(eq(instrument.id, novoId))
      }

      // TODAS as posições do tenant naquele instrumento, não só a clicada: o
      // mesmo ativo em duas carteiras é o mesmo ativo, e deixar uma apontando
      // para a moeda errada faria o total do dashboard não bater com a soma das
      // partes.
      await tx
        .update(position)
        .set({ instrumentId: novoId })
        .where(
          and(
            eq(position.instrumentId, alvo.instrumentId),
            eq(position.tenantId, context.tenantId),
            isNull(position.deletedAt),
          ),
        )
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
