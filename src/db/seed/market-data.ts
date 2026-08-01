import { eq, inArray } from 'drizzle-orm'
import { buildHistory, DEMO_POSITIONS } from '@/mocks/portfolio'
import { money, sum } from '@/core/money/decimal'
import type { Database } from '@/db/client'
import { instrument, portfolioSnapshot, quote } from '@/db/schema'

const PROVIDER = 'seed'

/**
 * Cotações da demonstração.
 *
 * Sem elas o dashboard mostraria lucro zero em tudo: a posição conhece o preço
 * médio pago, mas o valor de mercado vem da tabela `quote`. Gravar aqui exercita
 * o mesmo caminho que os providers da Fase 4 vão usar — a aplicação não sabe se
 * o preço veio da CoinGecko ou do seed.
 *
 * Idempotente por instrumento: reexecutar atualiza o preço em vez de empilhar.
 */
export async function seedQuotes(db: Database): Promise<number> {
  const symbols = [...new Set(DEMO_POSITIONS.map((p) => p.symbol))]

  const rows = await db
    .select({ id: instrument.id, symbol: instrument.symbol })
    .from(instrument)
    .where(inArray(instrument.symbol, symbols))

  const idBySymbol = new Map(rows.map((r) => [r.symbol, r.id]))

  // Datada no passado, de propósito.
  //
  // Carimbar a cotação de demonstração com a hora atual era mentir: preço
  // inventado se apresentando como leitura de mercado deste instante. Além de
  // desonesto no dado, dava um efeito colateral concreto — uma cotação real
  // vinda de fonte com atraso chega carimbada horas atrás e ficava atrás da
  // falsa em qualquer ordenação por `as_of`.
  const asOf = new Date(Date.now() - 7 * 86_400_000)
  let count = 0

  for (const symbol of symbols) {
    const instrumentId = idBySymbol.get(symbol)
    const demo = DEMO_POSITIONS.find((p) => p.symbol === symbol)
    if (!instrumentId || !demo) continue

    await db.delete(quote).where(eq(quote.instrumentId, instrumentId))

    await db.insert(quote).values({
      instrumentId,
      price: demo.currentPrice,
      currency: 'BRL',
      asOf,
      provider: PROVIDER,
    })

    count += 1
  }

  return count
}

/**
 * Série histórica da demonstração.
 *
 * Grava em `portfolio_snapshot` o mesmo passeio determinístico que a Fase 1
 * gerava no cliente. A diferença é o que importa: agora o gráfico de evolução
 * LÊ de tabela. Quando o job diário da Fase 4 entrar, ele só continua a série —
 * nenhum componente muda.
 */
export async function seedSnapshots(
  db: Database,
  tenantId: string,
  walletIdByName: Map<string, string>,
): Promise<number> {
  const valueOf = (p: (typeof DEMO_POSITIONS)[number]) =>
    money(p.quantity).times(money(p.currentPrice))

  const totalValue = sum(DEMO_POSITIONS.map(valueOf))
  const totalCost = sum(DEMO_POSITIONS.map((p) => money(p.quantity).times(money(p.avgPrice))))
  const totalIncome = sum(DEMO_POSITIONS.map((p) => money(p.income ?? 0)))

  // Composição de hoje, usada como proporção para o passado.
  const shareByClass = new Map<string, number>()
  const shareByWallet = new Map<string, number>()

  for (const p of DEMO_POSITIONS) {
    const share = valueOf(p).dividedBy(totalValue).toNumber()
    shareByClass.set(p.classSlug, (shareByClass.get(p.classSlug) ?? 0) + share)

    const walletId = walletIdByName.get(p.walletId)
    if (walletId) {
      shareByWallet.set(walletId, (shareByWallet.get(walletId) ?? 0) + share)
    }
  }

  const history = buildHistory(totalValue, totalCost, 'patrimonio')

  await db.delete(portfolioSnapshot).where(eq(portfolioSnapshot.tenantId, tenantId))

  // Lote único: 241 inserts individuais seriam desperdício de round trip.
  await db.insert(portfolioSnapshot).values(
    history.map((point, index) => ({
      tenantId,
      date: point.date,
      totalValue: point.totalValue.toFixed(10),
      totalCost: point.totalCost.toFixed(10),
      // A renda entra proporcional ao avanço do período: foi recebida ao longo
      // do tempo, não toda no primeiro dia.
      totalIncome: totalIncome.times(index / (history.length - 1)).toFixed(10),
      breakdown: {
        byClass: proportional(point.totalValue, shareByClass),
        byWallet: proportional(point.totalValue, shareByWallet),
      },
    })),
  )

  return history.length
}

/**
 * Distribui o total do dia pela composição ATUAL.
 *
 * É uma aproximação, e assumidamente: a composição real de seis meses atrás não
 * existe — nunca foi gravada. Para dado de demonstração serve, e é o que
 * permite o gráfico por classe e por carteira funcionar antes da Fase 4.
 * Quando o job diário entrar, ele grava a composição verdadeira de cada dia.
 */
function proportional(
  total: ReturnType<typeof money>,
  shares: Map<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, share] of shares) {
    result[key] = total.times(share).toFixed(2)
  }
  return result
}
