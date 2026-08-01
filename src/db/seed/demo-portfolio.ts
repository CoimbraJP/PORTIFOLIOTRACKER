import { and, eq, inArray, isNull } from 'drizzle-orm'
import { computePosition } from '@/core/ledger/compute-position'
import type { LedgerEntry } from '@/core/ledger/types'
import { money } from '@/core/money/decimal'
import { assetClass as assetClassConfig } from '@/config/asset-classes'
import type { Database } from '@/db/client'
import { instrument, position, transaction, wallet } from '@/db/schema'
import { DEMO_POSITIONS, MOCK_WALLETS } from '@/mocks/portfolio'
import type { AssetClassSlug } from '@/core/types/portfolio'

/**
 * Grava a carteira de demonstração como TRANSAÇÕES, não como posições prontas.
 *
 * É a diferença entre um seed que enfeita a tela e um seed que testa o sistema:
 * as posições saem de `computePosition()`, o mesmo motor que a aplicação usa.
 * Se o motor estiver errado, os números do dashboard saem errados aqui também —
 * que é exatamente o que se quer de um dado de teste.
 *
 * Idempotente pela `idempotency_key` de cada lançamento.
 */
export async function seedDemoPortfolio(
  db: Database,
  tenantId: string,
  classIdBySlug: Map<string, string>,
): Promise<{
  wallets: number
  positions: number
  transactions: number
  walletIdByMockId: Map<string, string>
}> {
  // Chave `mockWalletId:classSlug`, não só o id da carteira.
  //
  // Uma carteira pertence a EXATAMENTE UMA classe — é a classe que define o que
  // ela organiza, os rótulos ("Corretora", "Cidade") e as colunas. A XP guarda
  // ações e FIIs, então precisa existir uma vez em cada classe. Assumir uma
  // classe só por nome jogava os FIIs dentro de uma carteira de ações e mandava
  // o CDB para a API de bolsa.
  const walletIdByKey = new Map<string, string>()
  let transactionCount = 0

  const walletKey = (mockWalletId: string, slug: string) => `${mockWalletId}:${slug}`

  // --- carteiras ----------------------------------------------------------
  const combos = new Set(DEMO_POSITIONS.map((p) => walletKey(p.walletId, p.classSlug)))

  for (const key of combos) {
    const [mockWalletId, slug] = key.split(':') as [string, string]
    const mockWallet = MOCK_WALLETS.find((w) => w.id === mockWalletId)
    if (!mockWallet) continue

    const classId = classIdBySlug.get(slug)
    if (!classId) throw new Error(`Classe ${slug} não encontrada no banco`)

    const [existing] = await db
      .select({ id: wallet.id })
      .from(wallet)
      .where(
        and(
          eq(wallet.tenantId, tenantId),
          eq(wallet.name, mockWallet.name),
          eq(wallet.assetClassId, classId),
        ),
      )
      .limit(1)

    if (existing) {
      walletIdByKey.set(key, existing.id)
      continue
    }

    const [created] = await db
      .insert(wallet)
      .values({
        tenantId,
        assetClassId: classId,
        name: mockWallet.name,
        kind: mockWallet.kind,
      })
      .returning({ id: wallet.id })

    if (created) walletIdByKey.set(key, created.id)
  }

  // --- instrumentos, posições e lançamentos -------------------------------
  const instrumentIdBySymbol = new Map<string, string>()
  /** Instrumento → carteiras onde ele DEVE estar. Usado na limpeza no fim. */
  const carteirasPorInstrumento = new Map<string, Set<string>>()

  for (const demo of DEMO_POSITIONS) {
    const walletId = walletIdByKey.get(walletKey(demo.walletId, demo.classSlug))
    if (!walletId) continue

    const isPrivate = assetClassConfig(demo.classSlug).privateInstrument
    const instrumentKey = isPrivate ? `${tenantId}:${demo.symbol}` : demo.symbol

    let instrumentId = instrumentIdBySymbol.get(instrumentKey)

    if (!instrumentId) {
      const [found] = await db
        .select({ id: instrument.id })
        .from(instrument)
        .where(eq(instrument.symbol, demo.symbol))
        .limit(1)

      if (found) {
        instrumentId = found.id
      } else {
        const [created] = await db
          .insert(instrument)
          .values({
            tenantId: isPrivate ? tenantId : null,
            isGlobal: !isPrivate,
            symbol: demo.symbol,
            name: demo.name,
            kind: assetClassConfig(demo.classSlug).instrumentKind,
            currency: 'BRL',
          })
          .returning({ id: instrument.id })

        instrumentId = created?.id
      }

      if (instrumentId) instrumentIdBySymbol.set(instrumentKey, instrumentId)
    }

    if (!instrumentId) continue

    const destinos = carteirasPorInstrumento.get(instrumentId) ?? new Set<string>()
    destinos.add(walletId)
    carteirasPorInstrumento.set(instrumentId, destinos)

    // Posição
    const [existingPosition] = await db
      .select({ id: position.id })
      .from(position)
      .where(and(eq(position.walletId, walletId), eq(position.instrumentId, instrumentId)))
      .limit(1)

    const positionId =
      existingPosition?.id ??
      (
        await db
          .insert(position)
          .values({
            tenantId,
            walletId,
            instrumentId,
            openedAt: BUY_DATE,
            customFields: {},
          })
          .returning({ id: position.id })
      )[0]?.id

    if (!positionId) continue

    // Lançamentos: a compra que originou a posição, e o provento acumulado.
    const entries: LedgerEntry[] = []

    const buyKey = `demo:${demo.id}:buy`
    entries.push({
      id: buyKey,
      type: 'BUY',
      occurredAt: new Date(`${BUY_DATE}T12:00:00Z`),
      quantity: money(demo.quantity),
      unitPrice: money(demo.avgPrice),
      fees: money(0),
      taxes: money(0),
      netAmount: money(demo.quantity).times(money(demo.avgPrice)),
      ratio: null,
      transferCost: null,
    })

    await upsertTransaction(db, {
      tenantId,
      positionId,
      type: 'BUY',
      occurredAt: new Date(`${BUY_DATE}T12:00:00Z`),
      quantity: demo.quantity,
      unitPrice: demo.avgPrice,
      grossAmount: money(demo.quantity).times(money(demo.avgPrice)).toString(),
      netAmount: money(demo.quantity).times(money(demo.avgPrice)).toString(),
      idempotencyKey: buyKey,
    })
    transactionCount += 1

    if (demo.income && demo.income !== '0') {
      const incomeKey = `demo:${demo.id}:income`
      const incomeType = incomeTypeFor(demo.classSlug)

      entries.push({
        id: incomeKey,
        type: incomeType,
        occurredAt: new Date(`${INCOME_DATE}T12:00:00Z`),
        quantity: money(0),
        unitPrice: money(0),
        fees: money(0),
        taxes: money(0),
        netAmount: money(demo.income),
        ratio: null,
        transferCost: null,
      })

      await upsertTransaction(db, {
        tenantId,
        positionId,
        type: incomeType,
        occurredAt: new Date(`${INCOME_DATE}T12:00:00Z`),
        quantity: '0',
        unitPrice: '0',
        grossAmount: demo.income,
        netAmount: demo.income,
        idempotencyKey: incomeKey,
      })
      transactionCount += 1
    }

    // Posição derivada — nunca digitada. Ver CLAUDE.md §2.1.
    const state = computePosition(entries)

    await db
      .update(position)
      .set({
        quantity: state.quantity.toString(),
        avgPrice: state.avgPrice.toString(),
        totalCost: state.totalCost.toString(),
        realizedPnl: state.realizedPnl.toString(),
        incomeTotal: state.incomeTotal.toString(),
        recomputedAt: new Date(),
      })
      .where(eq(position.id, positionId))
  }

  await arquivarPosicoesForaDeLugar(db, tenantId, carteirasPorInstrumento)

  // O snapshot indexa por carteira, e agora existe uma por classe. Mantém a
  // chave antiga apontando para a primeira, que é o suficiente para o
  // breakdown proporcional da demonstração.
  const walletIdByMockId = new Map<string, string>()
  for (const [key, id] of walletIdByKey) {
    const mockId = key.split(':')[0]!
    if (!walletIdByMockId.has(mockId)) walletIdByMockId.set(mockId, id)
  }

  return {
    wallets: walletIdByKey.size,
    positions: DEMO_POSITIONS.length,
    transactions: transactionCount,
    walletIdByMockId,
  }
}

/**
 * Arquiva posições de demonstração que ficaram na carteira errada.
 *
 * Quando o seed passou a criar uma carteira por classe, as posições gravadas
 * pela versão anterior continuaram onde estavam — o CDB, por exemplo, seguia
 * dentro de uma carteira de ações. Rodar o seed de novo criava a posição certa
 * sem remover a errada, e o ativo aparecia duas vezes.
 *
 * `deleted_at`, não `DELETE`: nada que representa patrimônio é apagado de
 * verdade (CLAUDE.md §2.9). A posição some das telas e o histórico permanece.
 *
 * Só toca em instrumentos do próprio seed. Posição criada pelo usuário nunca
 * está "fora de lugar" — ele escolheu onde colocar.
 */
async function arquivarPosicoesForaDeLugar(
  db: Database,
  tenantId: string,
  carteirasPorInstrumento: Map<string, Set<string>>,
): Promise<void> {
  const instrumentIds = [...carteirasPorInstrumento.keys()]
  if (instrumentIds.length === 0) return

  const existentes = await db
    .select({ id: position.id, instrumentId: position.instrumentId, walletId: position.walletId })
    .from(position)
    .where(
      and(
        eq(position.tenantId, tenantId),
        inArray(position.instrumentId, instrumentIds),
        isNull(position.deletedAt),
      ),
    )

  for (const row of existentes) {
    if (carteirasPorInstrumento.get(row.instrumentId)?.has(row.walletId)) continue

    await db.update(position).set({ deletedAt: new Date() }).where(eq(position.id, row.id))
  }
}

const BUY_DATE = '2024-02-15'
const INCOME_DATE = '2025-06-20'

function incomeTypeFor(slug: AssetClassSlug): LedgerEntry['type'] {
  if (slug === 'imoveis') return 'RENT'
  if (slug === 'emprestimos') return 'INTEREST'
  if (slug === 'fiis') return 'INCOME'
  return assetClassConfig(slug).supportsDividends ? 'DIVIDEND' : 'INCOME'
}

interface TransactionInput {
  tenantId: string
  positionId: string
  type: LedgerEntry['type']
  occurredAt: Date
  quantity: string
  unitPrice: string
  grossAmount: string
  netAmount: string
  idempotencyKey: string
}

async function upsertTransaction(db: Database, input: TransactionInput) {
  const [existing] = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(eq(transaction.idempotencyKey, input.idempotencyKey))
    .limit(1)

  if (existing) return

  await db.insert(transaction).values({
    tenantId: input.tenantId,
    positionId: input.positionId,
    type: input.type,
    occurredAt: input.occurredAt,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    grossAmount: input.grossAmount,
    netAmount: input.netAmount,
    currency: 'BRL',
    fxRate: '1',
    source: 'MANUAL',
    idempotencyKey: input.idempotencyKey,
    notes: 'Carteira de demonstração',
  })
}
