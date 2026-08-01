'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { withRls } from '@/db/rls'
import { assetClass, wallet } from '@/db/schema'
import { requireTenant } from '@/server/auth/session'
import { newWalletSchema, renameWalletSchema } from '@/server/validation/wallet'

export interface ActionResult {
  ok: boolean
  error?: string
  walletId?: string
}

/**
 * Cria uma carteira vazia.
 *
 * Antes, criar carteira só era possível de dentro do formulário de ativo — o
 * botão "Criar carteira" abria o diálogo de adicionar ativo, e a carteira
 * nascia como efeito colateral. Duas ações diferentes num caminho só, e a mais
 * simples escondida dentro da mais complexa.
 *
 * Carteira vazia é um estado legítimo: abrir conta na corretora e só depois
 * comprar é a ordem natural das coisas.
 */
export async function createWallet(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = newWalletSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { classSlug, name, kind } = parsed.data

  try {
    const id = await withRls(context.user.id, async (tx) => {
      const [classe] = await tx
        .select({ id: assetClass.id })
        .from(assetClass)
        .where(eq(assetClass.slug, classSlug))
        .limit(1)

      if (!classe) throw new Error('Classe não encontrada.')

      // Nome repetido dentro da mesma classe não é erro do banco, é confusão na
      // tela: duas "XP" em Ações deixam o usuário sem saber em qual lançou.
      const [existente] = await tx
        .select({ id: wallet.id })
        .from(wallet)
        .where(
          and(
            eq(wallet.tenantId, context.tenantId),
            eq(wallet.assetClassId, classe.id),
            eq(wallet.name, name),
            isNull(wallet.deletedAt),
          ),
        )
        .limit(1)

      if (existente) throw new Error(`Já existe uma carteira chamada "${name}" nesta classe.`)

      const [criada] = await tx
        .insert(wallet)
        .values({ tenantId: context.tenantId, assetClassId: classe.id, name, kind })
        .returning({ id: wallet.id })

      return criada!.id
    })

    revalidatePath('/', 'layout')
    return { ok: true, walletId: id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }
}

/**
 * Renomeia uma carteira.
 *
 * Só o nome e o tipo. Mudar a CLASSE seria mover todos os ativos de uma vez
 * para um lugar onde talvez não caibam — um CDB acabaria numa carteira de
 * ações, que é exatamente o problema que já custou caro aqui.
 */
export async function renameWallet(raw: unknown): Promise<ActionResult> {
  const context = await requireTenant()

  const parsed = renameWalletSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { id, name, kind } = parsed.data

  try {
    await withRls(context.user.id, async (tx) => {
      const [atual] = await tx
        .select({ assetClassId: wallet.assetClassId })
        .from(wallet)
        .where(
          and(
            eq(wallet.id, id),
            eq(wallet.tenantId, context.tenantId),
            isNull(wallet.deletedAt),
          ),
        )
        .limit(1)

      if (!atual) throw new Error('Carteira não encontrada.')

      const [conflito] = await tx
        .select({ id: wallet.id })
        .from(wallet)
        .where(
          and(
            eq(wallet.tenantId, context.tenantId),
            eq(wallet.assetClassId, atual.assetClassId),
            eq(wallet.name, name),
            ne(wallet.id, id),
            isNull(wallet.deletedAt),
          ),
        )
        .limit(1)

      if (conflito) throw new Error(`Já existe uma carteira chamada "${name}" nesta classe.`)

      await tx
        .update(wallet)
        .set({ name, ...(kind ? { kind } : {}) })
        .where(eq(wallet.id, id))
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
