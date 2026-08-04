'use server'

import { revalidatePath } from 'next/cache'
import { diffYears } from '@/core/reconstruct/diff-years'
import { agruparPorAno, readSnapshot } from '@/core/reconstruct/read-snapshot'
import { toProposals, type Proposal } from '@/core/reconstruct/to-proposals'
import type { YearSnapshot } from '@/core/reconstruct/types'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { requireTenant } from '@/server/auth/session'
import { refazerSnapshotSemFalhar } from '@/server/jobs/daily-snapshot'
import { gravarReconstrucao, type ReconstructReport } from '@/server/reconstruct/commit'
import { gravarAnualSchema, lerAnualSchema } from '@/server/validation/reconstruct'

export interface LerAnualResult {
  ok: boolean
  error?: string
  /** Quantos ativos cada ano trouxe. Serve para o usuário conferir a leitura. */
  anos?: { year: number; ativos: number }[]
  avisos?: string[]
  propostas?: Proposal[]
}

export interface GravarAnualResult {
  ok: boolean
  error?: string
  report?: ReconstructReport
}

/**
 * Lê os relatórios anuais e propõe o histórico. NÃO grava nada.
 *
 * O resultado é uma proposta, e o nome importa: o relatório diz o que a pessoa
 * TINHA em 31/12, não o que ela negociou. Tudo que sai daqui é dedução, e a
 * tela existe para o dono da carteira corrigir antes que vire patrimônio.
 */
export async function lerRelatoriosAnuais(raw: unknown): Promise<LerAnualResult> {
  await requireTenant()

  const parsed = lerAnualSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  try {
    const lidos = parsed.data.arquivos.map(readSnapshot)
    const avisos = lidos.flatMap((r, i) =>
      r.erro ? [`${parsed.data.arquivos[i]?.nome}: ${r.erro}`] : [],
    )

    const porAno = agruparPorAno(lidos)

    if (porAno.size === 0) {
      return {
        ok: false,
        error: 'Nenhum arquivo pôde ser lido.',
        ...(avisos.length > 0 ? { avisos } : {}),
      }
    }

    if (porAno.size === 1) {
      return {
        ok: false,
        error:
          'Um ano só não diz o que mudou. Suba pelo menos dois relatórios — ' +
          'a reconstrução vem da diferença entre eles.',
        ...(avisos.length > 0 ? { avisos } : {}),
      }
    }

    const snapshots: YearSnapshot[] = [...porAno.entries()].map(([year, items]) => ({
      year,
      items,
    }))

    return {
      ok: true,
      anos: snapshots.map((s) => ({ year: s.year, ativos: s.items.length })).sort((a, b) => a.year - b.year),
      ...(avisos.length > 0 ? { avisos } : {}),
      propostas: toProposals(diffYears(snapshots)),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não consegui ler os relatórios.',
    }
  }
}

/**
 * Grava o histórico conferido.
 *
 * Recebe as propostas já editadas pela tela — e aqui, ao contrário da
 * importação de negócios, isso é inevitável: não existe arquivo de origem para
 * o servidor reler, porque o número não estava em arquivo nenhum. Ele foi
 * deduzido e depois corrigido por uma pessoa.
 *
 * A defesa é outra: cada proposta passa por `validarProposta` no servidor antes
 * de virar lançamento, e nenhuma delas entra sem anotação dizendo que é
 * reconstituição.
 */
export async function gravarRelatoriosAnuais(raw: unknown): Promise<GravarAnualResult> {
  const context = await requireTenant()

  const parsed = gravarAnualSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  let report: ReconstructReport

  try {
    report = await gravarReconstrucao(
      context.user.id,
      context.tenantId,
      parsed.data.classSlug as AssetClassSlug,
      parsed.data.wallet,
      parsed.data.propostas as Proposal[],
    )
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }

  if (report.gravados > 0) {
    // O histórico já foi gravado com sucesso neste ponto — uma falha ao
    // refazer a foto do dia não pode voltar como erro para uma reconstrução
    // que já aconteceu.
    await refazerSnapshotSemFalhar()
    revalidatePath('/', 'layout')
  }

  return { ok: true, report }
}
