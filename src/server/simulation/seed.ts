import 'server-only'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { money, type Money } from '@/core/money/decimal'
import { withServiceRole } from '@/db/rls'
import { assetClass, corporateAction, instrument, position, transaction, wallet } from '@/db/schema'
import { recomputePosition } from '@/server/services/recompute-position'
import {
  CARTEIRA_SIMULADA,
  SIMULACAO_ATE,
  quantidadeNaData,
  type AtivoSimulado,
} from './dataset'

/** Provider gravado nos eventos de mercado da simulação. É por ele que a remoção acha o que apagar. */
const PROVIDER = 'simulacao'

const CLASSE = 'acoes-br'

/** IR retido na fonte sobre JCP. Dividendo é isento para pessoa física. */
const IR_JCP = money('0.15')

export interface SimulationReport {
  /** Ativos da carteira que o conjunto de dados cobre. */
  ativos: number
  /** Eventos de mercado gravados (o que a API traria). */
  eventos: number
  /** Lançamentos de provento apurados para esta carteira. */
  proventos: number
  /** Símbolos do conjunto que não existem na carteira — ficam de fora. */
  ignorados: string[]
}

/**
 * Preenche a Renda Passiva por engenharia reversa, sobre a carteira que já existe.
 *
 * NÃO cria carteira, NÃO cria posição, NÃO lança compra e NÃO mexe em
 * quantidade nem em preço médio. As ações nacionais que o usuário cadastrou
 * são a base e ficam exatamente como estão — a simulação só responde a
 * pergunta que a API paga responderia: *quanto esta posição teria recebido de
 * dividendo e JCP desde 2020?*
 *
 * A conta é a mesma que o motor real faz, com uma diferença deliberada: em vez
 * de reconstruir a quantidade histórica pelo ledger — que aqui não existe,
 * porque a carteira foi cadastrada com a posição de hoje —, ela parte da
 * quantidade ATUAL e desfaz os eventos societários para trás. Quem tem 200
 * WEGE3 hoje e passou por um desdobramento 1:2 em 2021 tinha 100 em 2020, e é
 * sobre 100 que o dividendo daquele ano é apurado. Sem esse passo, cinco anos
 * de provento antigo apareceriam dobrados.
 *
 * Roda com `withServiceRole` porque `corporate_action` é tabela GLOBAL, sem
 * policy de escrita para `authenticated` (ver `db/policies/0001_rls.sql`).
 * Todo acesso a dado de tenant leva `tenantId` explícito no `where`.
 *
 * Idempotente: rodar duas vezes não duplica provento.
 */
export async function semearSimulacao(
  userId: string,
  tenantId: string,
): Promise<SimulationReport> {
  const relatorio: SimulationReport = { ativos: 0, eventos: 0, proventos: 0, ignorados: [] }
  const limite = new Date(`${SIMULACAO_ATE}T23:59:59Z`)

  await withServiceRole(async (tx) => {
    // As posições de ações nacionais que JÁ existem. Nada é criado aqui.
    const posicoes = await tx
      .select({
        positionId: position.id,
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        quantity: position.quantity,
      })
      .from(position)
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      .where(
        and(
          eq(position.tenantId, tenantId),
          eq(assetClass.slug, CLASSE),
          isNull(position.deletedAt),
          isNull(wallet.deletedAt),
        ),
      )

    const porSimbolo = new Map(posicoes.map((p) => [p.symbol.toUpperCase(), p]))
    const tocadas = new Set<string>()

    for (const ativo of CARTEIRA_SIMULADA) {
      const alvo = porSimbolo.get(ativo.symbol.toUpperCase())

      // Papel do conjunto que não está na carteira fica de fora, em silêncio no
      // banco e explícito no relatório: inventar a posição seria alterar o
      // patrimônio, que é justamente o que esta função não faz.
      if (!alvo) {
        relatorio.ignorados.push(ativo.symbol)
        continue
      }

      relatorio.ativos += 1

      const eventos = await gravarEventosDeMercado(tx, alvo.instrumentId, ativo, limite)
      relatorio.eventos += eventos

      const proventos = await apurarProventos(
        tx,
        tenantId,
        alvo.positionId,
        alvo.instrumentId,
        money(alvo.quantity),
        ativo,
        limite,
      )

      relatorio.proventos += proventos
      if (proventos > 0) tocadas.add(alvo.positionId)
    }

    // O recálculo atualiza `income_total` da posição — a coluna derivada que a
    // tela lê. Quantidade, preço médio e custo saem do mesmo replay do ledger e
    // não mudam: provento não altera nenhum dos três, por definição.
    for (const positionId of tocadas) await recomputePosition(tx, positionId)
  })

  return relatorio
}

/**
 * Os eventos de mercado, na tabela global — exatamente o que a API traria.
 *
 * Guardar isto separado do lançamento não é cerimônia: o evento é o que a
 * empresa anunciou (igual para todo mundo), o lançamento é o que ESTA carteira
 * recebeu. Só o segundo é patrimônio de quem está olhando.
 */
async function gravarEventosDeMercado(
  tx: Tx,
  instrumentId: string,
  ativo: AtivoSimulado,
  limite: Date,
): Promise<number> {
  let gravados = 0

  for (const provento of ativo.proventos) {
    if (new Date(`${provento.paymentDate}T00:00:00Z`) > limite) continue

    const [existente] = await tx
      .select({ id: corporateAction.id })
      .from(corporateAction)
      .where(
        and(
          eq(corporateAction.instrumentId, instrumentId),
          eq(corporateAction.type, provento.tipo),
          eq(corporateAction.exDate, provento.exDate),
          eq(corporateAction.paymentDate, provento.paymentDate),
        ),
      )
      .limit(1)

    if (existente) continue

    await tx.insert(corporateAction).values({
      instrumentId,
      type: provento.tipo,
      exDate: provento.exDate,
      paymentDate: provento.paymentDate,
      valuePerShare: money(provento.valuePerShare).toFixed(10),
      currency: 'BRL',
      provider: PROVIDER,
      raw: { origem: 'simulacao', symbol: ativo.symbol },
    })

    gravados += 1
  }

  return gravados
}

/**
 * Quanto ESTA posição teria recebido de cada evento.
 *
 * A quantidade de cada data-com vem de `quantidadeNaData`, não do ledger: a
 * carteira foi cadastrada com a posição de hoje, então o ledger não sabe
 * quantas ações existiam em 2021. É esta a "engenharia reversa" — desfazer os
 * desdobramentos para trás em vez de reconstruir compras que ninguém
 * registrou.
 */
async function apurarProventos(
  tx: Tx,
  tenantId: string,
  positionId: string,
  instrumentId: string,
  quantidadeHoje: Money,
  ativo: AtivoSimulado,
  limite: Date,
): Promise<number> {
  if (quantidadeHoje.lessThanOrEqualTo(0)) return 0

  const acoes = await tx
    .select({
      id: corporateAction.id,
      type: corporateAction.type,
      exDate: corporateAction.exDate,
      paymentDate: corporateAction.paymentDate,
      valuePerShare: corporateAction.valuePerShare,
    })
    .from(corporateAction)
    .where(
      and(eq(corporateAction.instrumentId, instrumentId), eq(corporateAction.provider, PROVIDER)),
    )

  let gravados = 0

  for (const acao of acoes) {
    if (!acao.valuePerShare || !acao.paymentDate) continue
    if (new Date(`${acao.paymentDate}T00:00:00Z`) > limite) continue

    const chave = `sim:ca:${positionId}:${acao.id}`
    if (await jaExiste(tx, chave)) continue

    const quantidade = quantidadeNaData(quantidadeHoje, ativo, acao.exDate)
    if (quantidade.lessThanOrEqualTo(0)) continue

    const bruto = quantidade.times(money(acao.valuePerShare))
    if (bruto.lessThanOrEqualTo(0)) continue

    // JCP tem 15% retido na fonte; dividendo é isento. Registrar o bruto nos
    // dois casos inflaria a renda em 15% sobre uma parcela que nunca chegou.
    const imposto = acao.type === 'JCP' ? bruto.times(IR_JCP) : money(0)

    await tx.insert(transaction).values({
      tenantId,
      positionId,
      type: acao.type,
      occurredAt: new Date(`${acao.paymentDate}T12:00:00Z`),
      // Provento não altera quantidade nem preço médio — é dinheiro que entra.
      quantity: '0',
      unitPrice: '0',
      grossAmount: bruto.toFixed(10),
      taxes: imposto.toFixed(10),
      netAmount: bruto.minus(imposto).toFixed(10),
      currency: 'BRL',
      fxRate: '1',
      source: 'AUTO_CORPORATE_ACTION',
      corporateActionId: acao.id,
      idempotencyKey: chave,
    })

    gravados += 1
  }

  return gravados
}

/**
 * Remove tudo que a simulação criou.
 *
 * Apaga só os lançamentos de provento e os eventos de mercado marcados como
 * simulação. Posições, carteiras e lançamentos do usuário não são tocados —
 * eles nunca foram criados por aqui, e a remoção não pode ser mais ampla do
 * que a escrita foi.
 */
export async function removerSimulacao(userId: string, tenantId: string): Promise<number> {
  let apagados = 0

  await withServiceRole(async (tx) => {
    const eventos = await tx
      .select({ id: corporateAction.id })
      .from(corporateAction)
      .where(eq(corporateAction.provider, PROVIDER))

    const ids = eventos.map((e) => e.id)
    if (ids.length === 0) return

    const afetadas = await tx
      .select({ positionId: transaction.positionId })
      .from(transaction)
      .where(and(eq(transaction.tenantId, tenantId), inArray(transaction.corporateActionId, ids)))

    const removidos = await tx
      .delete(transaction)
      .where(and(eq(transaction.tenantId, tenantId), inArray(transaction.corporateActionId, ids)))
      .returning({ id: transaction.id })

    apagados = removidos.length

    await tx.delete(corporateAction).where(inArray(corporateAction.id, ids))

    // `income_total` precisa voltar ao que era. As outras colunas derivadas não
    // mudam: provento nunca as tocou.
    for (const positionId of new Set(afetadas.map((a) => a.positionId))) {
      await recomputePosition(tx, positionId)
    }
  })

  return apagados
}

async function jaExiste(tx: Tx, chave: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: transaction.id })
    .from(transaction)
    .where(eq(transaction.idempotencyKey, chave))
    .limit(1)

  return Boolean(row)
}

type Tx = Parameters<Parameters<typeof withServiceRole>[0]>[0]
