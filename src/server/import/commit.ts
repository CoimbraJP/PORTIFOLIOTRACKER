import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { importKey, ordenarParaLedger, type ImportedRow } from '@/core/import'
import { money } from '@/core/money/decimal'
import { convertMoney } from '@/core/money/display'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import { transaction } from '@/db/schema'
import { findManyInCatalog } from '@/server/services/catalog-lookup'
import { recomputePosition } from '@/server/services/recompute-position'
import { resolvePosition } from '@/server/services/resolve-position'

export interface ImportReport {
  importados: number
  /** Já estavam no sistema. Reimportar o mesmo arquivo cai todo aqui. */
  repetidos: number
  /** Linhas que o arquivo não permitiu ler. */
  comErro: number
  /** Linhas gravadas, mas que merecem conferência. */
  comAviso: number
  carteiras: string[]
}

/**
 * Grava as linhas boas de uma importação.
 *
 * Tudo numa transação só. Falha no meio de um arquivo de duzentas linhas não
 * pode deixar metade da carteira dentro e metade fora — o usuário não teria
 * como saber onde parou, e reimportar depois de um sucesso parcial é
 * justamente o caso em que a idempotência precisa estar certa.
 */
export async function gravarImportacao(
  userId: string,
  tenantId: string,
  classSlug: AssetClassSlug,
  rows: ImportedRow[],
): Promise<ImportReport> {
  // Ordem do LEDGER, não a do arquivo: a posição nasce com a data da primeira
  // compra, e venda antes da compra inventa patrimônio. Ver `ordenarParaLedger`.
  const boas = ordenarParaLedger(rows.filter((r) => !r.erro))

  const relatorio: ImportReport = {
    importados: 0,
    repetidos: 0,
    comErro: rows.length - boas.length,
    comAviso: boas.filter((r) => r.aviso).length,
    carteiras: [...new Set(boas.map((r) => r.wallet))],
  }

  if (boas.length === 0) return relatorio

  const catalogo = await findManyInCatalog(
    classSlug,
    boas.map((r) => r.symbol),
  )

  const chaves = boas.map(importKey)

  await withRls(userId, async (tx) => {
    // Quais destas já existem. Reimportar o extrato do mês seguinte, com os
    // negócios antigos junto, é o uso NORMAL — não uma exceção a tratar depois.
    const existentes = new Set(
      (
        await tx
          .select({ chave: transaction.idempotencyKey })
          .from(transaction)
          .where(
            and(
              eq(transaction.tenantId, tenantId),
              inArray(transaction.idempotencyKey, chaves),
            ),
          )
      ).map((r) => r.chave),
    )

    const posicoes = new Map<string, string>()
    const tocadas = new Set<string>()

    for (const row of boas) {
      const chave = importKey(row)

      if (existentes.has(chave)) {
        relatorio.repetidos += 1
        continue
      }

      const destino = `${row.wallet}|${row.symbol}`
      let positionId = posicoes.get(destino)

      if (!positionId) {
        const resolved = await resolvePosition(
          tx,
          tenantId,
          {
            classSlug,
            walletName: row.wallet,
            symbol: row.symbol,
            name: row.name,
            openedAt: row.date,
          },
          catalogo.get(row.symbol) ?? null,
        )
        positionId = resolved.positionId
        posicoes.set(destino, positionId)
      }

      await tx.insert(transaction).values({
        tenantId,
        positionId,
        ...valoresDe(row),
        source: 'IMPORT',
        idempotencyKey: chave,
        notes: row.aviso ?? null,
      })

      // Marca a chave como vista: duas linhas idênticas dentro do MESMO arquivo
      // já são distinguidas pela ocorrência, mas a rede pode repetir o envio.
      existentes.add(chave)
      tocadas.add(positionId)
      relatorio.importados += 1
    }

    for (const positionId of tocadas) {
      await recomputePosition(tx, positionId)
    }
  })

  return relatorio
}

/**
 * Traduz a linha lida para as colunas do ledger.
 *
 * O preço em dólar é convertido pelo câmbio DA DATA e é assim que ele fica para
 * sempre — é o que a Receita considera e o que descreve quanto o patrimônio
 * realmente cresceu. Nada se perde: a moeda digitada e a taxa ficam gravadas,
 * então o valor original em dólar é sempre `unit_price / fx_rate`.
 */
function valoresDe(row: ImportedRow) {
  const rate = money(row.rate)
  const quantity = money(row.quantity)
  const unitPrice = convertMoney(money(row.unitPrice), row.currency, 'BRL', rate)
  // A taxa segue a moeda do negócio: corretagem cobrada numa compra em dólar
  // está em dólar, e somá-la crua ao custo em reais a dividiria por cinco.
  const fees = convertMoney(money(row.fees), row.currency, 'BRL', rate)
  const gross = quantity.times(unitPrice)

  return {
    type: row.side,
    occurredAt: new Date(`${row.date}T12:00:00Z`),
    quantity: quantity.toFixed(10),
    unitPrice: unitPrice.toFixed(10),
    grossAmount: gross.toFixed(10),
    fees: fees.toFixed(10),
    // Compra soma custos ao que saiu; venda desconta do que entrou.
    netAmount: (row.side === 'BUY' ? gross.plus(fees) : gross.minus(fees)).toFixed(10),
    currency: row.currency,
    fxRate: rate.toFixed(10),
  } as const
}
