'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/server/auth/session'
import { refazerSnapshotSemFalhar } from '@/server/jobs/daily-snapshot'
import { removerSimulacao, semearSimulacao, type SimulationReport } from '@/server/simulation/seed'

export interface SimulationResult {
  ok: boolean
  error?: string
  report?: SimulationReport
  /** Quantos lançamentos saíram, na remoção. */
  removidos?: number
}

/**
 * Sobe a carteira de demonstração com proventos reais de 2020 a hoje.
 *
 * Existe para responder uma pergunta que dado sintético não responde: a tela
 * de Renda Passiva aguenta a bagunça do mercado de verdade? Empresa que muda
 * de ticker, desdobramento no meio da série, ano inteiro sem pagar nada,
 * companhia que só dá prejuízo. Tudo isso está no conjunto.
 */
export async function carregarSimulacao(): Promise<SimulationResult> {
  const context = await requireTenant()

  try {
    const report = await semearSimulacao(context.user.id, context.tenantId)

    await refazerSnapshotSemFalhar()
    revalidatePath('/', 'layout')

    return { ok: true, report }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não consegui carregar a simulação.',
    }
  }
}

/** Tira da frente tudo que a simulação criou. */
export async function limparSimulacao(): Promise<SimulationResult> {
  const context = await requireTenant()

  try {
    const removidos = await removerSimulacao(context.user.id, context.tenantId)

    await refazerSnapshotSemFalhar()
    revalidatePath('/', 'layout')

    return { ok: true, removidos }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não consegui limpar a simulação.',
    }
  }
}
