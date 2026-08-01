'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withRls } from '@/db/rls'
import {
  instrumentLogoOverride,
  portfolioSnapshot,
  position,
  valuation,
  wallet,
} from '@/db/schema'
import { requireTenant } from '@/server/auth/session'

export interface WipeResult {
  ok: boolean
  error?: string
}

/** O que o usuário precisa digitar. Confirmação que não se clica por engano. */
export const WIPE_PHRASE = 'APAGAR TUDO'

/**
 * Apaga todo o patrimônio do tenant.
 *
 * Existe para a fase de testes, onde recomeçar do zero é rotina. Apaga DE
 * VERDADE — carteiras, posições, lançamentos, avaliações, snapshots e logos
 * escolhidos à mão. Soft delete aqui não serviria: o objetivo é justamente
 * limpar, e linhas arquivadas continuariam pesando nas consultas e no seed.
 *
 * O que NÃO é apagado: o tenant, as classes de ativo e os dados de mercado
 * (cotação, catálogo, proventos). Nada disso é patrimônio de ninguém — cotação
 * do PETR4 é a mesma para todo mundo, e apagá-la só obrigaria a rebuscar.
 *
 * Cascata faz o resto: apagar a carteira leva junto posição, lançamento e
 * avaliação. A ordem aqui é a das dependências, não a das tabelas.
 */
export async function wipeTenantData(phrase: string): Promise<WipeResult> {
  const context = await requireTenant()

  // Digitar a frase é a única forma de confirmar.
  //
  // Um `confirm()` do navegador se aceita no reflexo, e esta ação não tem
  // volta. Escrever "APAGAR TUDO" exige ler o que está sendo feito.
  if (phrase.trim().toUpperCase() !== WIPE_PHRASE) {
    return { ok: false, error: `Digite exatamente "${WIPE_PHRASE}" para confirmar.` }
  }

  try {
    await withRls(context.user.id, async (tx) => {
      await tx.delete(valuation).where(eq(valuation.tenantId, context.tenantId))
      await tx.delete(position).where(eq(position.tenantId, context.tenantId))
      await tx.delete(wallet).where(eq(wallet.tenantId, context.tenantId))
      await tx
        .delete(portfolioSnapshot)
        .where(eq(portfolioSnapshot.tenantId, context.tenantId))
      await tx
        .delete(instrumentLogoOverride)
        .where(eq(instrumentLogoOverride.tenantId, context.tenantId))
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao apagar.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
