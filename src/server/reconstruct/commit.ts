import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { money } from '@/core/money/decimal'
import { validarProposta, type Proposal } from '@/core/reconstruct/to-proposals'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import { transaction } from '@/db/schema'
import { findManyInCatalog } from '@/server/services/catalog-lookup'
import { recomputePosition } from '@/server/services/recompute-position'
import { resolvePosition } from '@/server/services/resolve-position'

export interface ReconstructReport {
  gravados: number
  repetidos: number
  recusados: { symbol: string; year: number; motivo: string }[]
}

/**
 * Grava o histórico reconstruído.
 *
 * Todo lançamento sai marcado como reconstruído na anotação. Isso não é
 * decoração: o custo veio de um preço de FECHAMENTO, não do preço pago, e daqui
 * a dois anos ninguém vai lembrar disso olhando um extrato. Quem for calcular
 * imposto precisa saber quais linhas são fato e quais são reconstituição.
 *
 * Idempotente pela mesma razão da importação de negócios: subir os relatórios
 * de novo é o caso normal — todo janeiro nasce um relatório a mais.
 */
export async function gravarReconstrucao(
  userId: string,
  tenantId: string,
  classSlug: AssetClassSlug,
  walletName: string,
  propostas: readonly Proposal[],
): Promise<ReconstructReport> {
  const relatorio: ReconstructReport = { gravados: 0, repetidos: 0, recusados: [] }

  const validas: Proposal[] = []

  for (const p of propostas) {
    if (!p.incluir) continue

    const erro = validarProposta(p)
    if (erro) {
      relatorio.recusados.push({ symbol: p.symbol, year: p.year, motivo: erro })
      continue
    }

    validas.push(p)
  }

  if (validas.length === 0) return relatorio

  // Ordem cronológica: a posição nasce na data do primeiro lançamento, e o
  // ledger precisa ver a compra antes da bonificação que ela gerou.
  const ordenadas = [...validas].sort((a, b) => a.date.localeCompare(b.date))

  const simbolos = ordenadas.flatMap((p) => [p.symbol, ...(p.fromSymbol ? [p.fromSymbol] : [])])
  const catalogo = await findManyInCatalog(classSlug, simbolos)

  const chaves = ordenadas.map(chaveDe)

  await withRls(userId, async (tx) => {
    const existentes = new Set(
      (
        await tx
          .select({ chave: transaction.idempotencyKey })
          .from(transaction)
          .where(
            and(eq(transaction.tenantId, tenantId), inArray(transaction.idempotencyKey, chaves)),
          )
      ).map((r) => r.chave),
    )

    const posicoes = new Map<string, string>()
    const tocadas = new Set<string>()

    const posicaoDe = async (symbol: string, name: string, openedAt: string) => {
      const cache = posicoes.get(symbol)
      if (cache) return cache

      const { positionId } = await resolvePosition(
        tx,
        tenantId,
        { classSlug, walletName, symbol, name, openedAt },
        catalogo.get(symbol) ?? null,
      )

      posicoes.set(symbol, positionId)
      return positionId
    }

    for (const p of ordenadas) {
      const chave = chaveDe(p)

      if (existentes.has(chave)) {
        relatorio.repetidos += 1
        continue
      }

      const occurredAt = new Date(`${p.date}T12:00:00Z`)
      const positionId = await posicaoDe(p.symbol, p.name, p.date)

      if (p.type === 'TRANSFERENCIA') {
        if (!p.fromSymbol) {
          relatorio.recusados.push({
            symbol: p.symbol,
            year: p.year,
            motivo: 'Troca de código sem o ticker de origem.',
          })
          continue
        }

        // As duas pernas carregam o MESMO custo e compartilham um grupo. Sem
        // `transferCost`, a saída levaria o custo médio e a entrada inventaria
        // outro — e a troca de nome viraria lucro (ou prejuízo) do nada.
        const origem = await posicaoDe(p.fromSymbol, p.fromSymbol, p.date)
        const grupo = randomUUID()

        await tx.insert(transaction).values({
          tenantId,
          positionId: origem,
          type: 'TRANSFER_OUT',
          occurredAt,
          quantity: '0',
          unitPrice: '0',
          grossAmount: '0',
          netAmount: '0',
          transferGroupId: grupo,
          source: 'IMPORT',
          idempotencyKey: `${chave}:saida`,
          notes: anotacao(p),
        })

        await tx.insert(transaction).values({
          tenantId,
          positionId,
          type: 'TRANSFER_IN',
          occurredAt,
          quantity: money(p.quantity).toFixed(10),
          unitPrice: '0',
          grossAmount: '0',
          netAmount: '0',
          transferGroupId: grupo,
          source: 'IMPORT',
          idempotencyKey: `${chave}:entrada`,
          notes: anotacao(p),
        })

        existentes.add(chave)
        tocadas.add(origem)
        tocadas.add(positionId)
        relatorio.gravados += 1
        continue
      }

      await tx.insert(transaction).values({
        tenantId,
        positionId,
        // O tipo vai como argumento separado porque `Proposal` é uma forma só,
        // não uma união discriminada: o TypeScript estreita `p.type` aqui, mas
        // não estreita `p`. Passar os dois deixa o compilador provar que
        // transferência nunca chega em `valoresDe`.
        ...valoresDe(p, p.type),
        occurredAt,
        source: 'IMPORT',
        idempotencyKey: chave,
        notes: anotacao(p),
      })

      existentes.add(chave)
      tocadas.add(positionId)
      relatorio.gravados += 1
    }

    for (const positionId of tocadas) {
      await recomputePosition(tx, positionId)
    }
  })

  return relatorio
}

/**
 * Chave de idempotência.
 *
 * Inclui o ANO e o tipo, não a data escolhida: mudar a data de 31/12 para
 * 15/03 corrige o mesmo evento, não cria outro. Sem isso, cada ajuste de data
 * gravaria uma segunda compra.
 */
function chaveDe(p: Proposal): string {
  return `anual:${p.year}:${p.symbol}:${p.type}:${p.quantity}`
}

/**
 * A anotação que fica no lançamento para sempre.
 *
 * Diz que o número é reconstituído e de onde ele veio. É a diferença entre um
 * custo que alguém pagou e um custo que o sistema deduziu — e só quem tem essa
 * informação consegue declarar imposto sem mentir sem querer.
 */
function anotacao(p: Proposal): string {
  return `Reconstruído do relatório anual de ${p.year}. ${p.motivo}`
}

function valoresDe(p: Proposal, type: Exclude<Proposal['type'], 'TRANSFERENCIA'>) {
  const quantity = money(p.quantity)

  if (type === 'SPLIT' || type === 'REVERSE_SPLIT') {
    return {
      type,
      // Quantidade zero de propósito: quem muda a posição é a RAZÃO. Mandar a
      // diferença aqui somaria em cima do que o motor já multiplicou.
      quantity: '0',
      unitPrice: '0',
      grossAmount: '0',
      netAmount: '0',
      ratio: money(p.ratio ?? '1').toFixed(10),
    } as const
  }

  if (type === 'BONUS') {
    return {
      type: 'BONUS',
      quantity: quantity.toFixed(10),
      unitPrice: '0',
      grossAmount: '0',
      netAmount: '0',
    } as const
  }

  const unitPrice = money(p.unitPrice)
  const gross = quantity.times(unitPrice)

  return {
    type,
    quantity: quantity.toFixed(10),
    unitPrice: unitPrice.toFixed(10),
    grossAmount: gross.toFixed(10),
    netAmount: gross.toFixed(10),
  } as const
}
