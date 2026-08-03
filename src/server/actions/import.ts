'use server'

import { revalidatePath } from 'next/cache'
import type { AssetClassSlug } from '@/core/types/portfolio'
import type { ImportedRow } from '@/core/import'
import { requireTenant } from '@/server/auth/session'
import { dailySnapshotJob } from '@/server/jobs/daily-snapshot'
import { gravarImportacao, type ImportReport } from '@/server/import/commit'
import { prepararImportacao } from '@/server/import/prepare'
import { importSchema } from '@/server/validation/import'

export interface FilePreview {
  nome: string
  /** Moeda que o próprio arquivo declara. Vence a escolha da tela. */
  moedaDoArquivo?: 'BRL' | 'USD'
  /** Por que este arquivo inteiro ficou de fora. */
  bloqueio?: string
  /** Como cada campo foi encontrado, para o usuário conferir antes de gravar. */
  reconhecido?: { campo: string; coluna: string }[]
  rows: ImportedRow[]
}

export interface PreviewResult {
  ok: boolean
  error?: string
  arquivos?: FilePreview[]
  /** Como foi a busca de câmbio, quando houve preço em dólar. */
  fx?: { fonte: 'bcb' | 'awesomeapi' | null; faltando: number; erro?: string }
}

export interface CommitResult {
  ok: boolean
  error?: string
  report?: ImportReport
}

const ROTULOS: Record<string, string> = {
  date: 'Data',
  classSlug: 'Classe',
  wallet: 'Carteira',
  symbol: 'Código',
  name: 'Nome',
  side: 'Operação',
  quantity: 'Quantidade',
  unitPrice: 'Preço unitário',
  currency: 'Moeda',
  rate: 'Câmbio',
  fees: 'Taxas',
}

/**
 * Lê os arquivos e mostra o que entendeu. NÃO grava nada.
 *
 * A pré-visualização não é cortesia: é onde o usuário descobre que a coluna
 * "Preço" era o preço de fechamento, ou que uma linha veio com o valor em outra
 * denominação. Depois de gravado, encontrar isso exige desfazer lançamento por
 * lançamento.
 */
export async function previewImport(raw: unknown): Promise<PreviewResult> {
  await requireTenant()

  const parsed = importSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  try {
    const preparado = await prepararImportacao(parsed.data)

    return {
      ok: true,
      ...(preparado.fx ? { fx: preparado.fx } : {}),
      arquivos: preparado.arquivos.map((prep) => ({
        nome: prep.nome,
        ...(prep.moedaDoArquivo ? { moedaDoArquivo: prep.moedaDoArquivo } : {}),
        bloqueio: prep.bloqueio,
        reconhecido: Object.entries(prep.mapping).map(([campo, indice]) => ({
          campo: ROTULOS[campo] ?? campo,
          coluna: prep.headers[indice] ?? '',
        })),
        rows: prep.rows,
      })),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não consegui ler os arquivos.',
    }
  }
}

/**
 * Grava os arquivos conferidos.
 *
 * Lê os CSVs de novo em vez de receber as linhas da tela. É mais trabalho e é
 * de propósito: aceitar números já convertidos pelo navegador deixaria o custo
 * de cada compra na mão do cliente, e o servidor não teria como perceber a
 * diferença entre cem e cem mil (CLAUDE.md §2.5).
 */
export async function commitImport(raw: unknown): Promise<CommitResult> {
  const context = await requireTenant()

  const parsed = importSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  try {
    const preparado = await prepararImportacao(parsed.data)

    // Um arquivo bloqueado não impede os outros — só não entra. Barrar a leva
    // inteira por causa de um obrigaria o usuário a subir tudo de novo sem ele.
    const linhas = preparado.arquivos.filter((p) => !p.bloqueio).flatMap((p) => p.rows)

    if (linhas.every((l) => l.erro)) {
      const motivo =
        preparado.fx?.erro ??
        preparado.arquivos.find((p) => p.bloqueio)?.bloqueio ??
        'Nenhuma linha pôde ser lida.'

      return { ok: false, error: motivo }
    }

    const report = await gravarImportacao(
      context.user.id,
      context.tenantId,
      parsed.data.classSlug as AssetClassSlug,
      linhas,
    )

    if (report.importados > 0) {
      // A foto do dia foi tirada antes destes lançamentos existirem, e snapshot
      // não se recalcula sozinho: sem isto o aporte importado só apareceria no
      // gráfico de evolução amanhã (CLAUDE.md §2.9).
      await dailySnapshotJob()
      revalidatePath('/', 'layout')
    }

    return { ok: true, report }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro desconhecido.' }
  }
}
