import 'server-only'

import { eq } from 'drizzle-orm'
import { assetClass as assetClassConfig } from '@/config/asset-classes'
import { money } from '@/core/money/decimal'
import { convertMoney } from '@/core/money/display'
import { withServiceRole } from '@/db/rls'
import { position, tenant, transaction, valuation } from '@/db/schema'
import { findManyInCatalog } from '@/server/services/catalog-lookup'
import { recomputePosition } from '@/server/services/recompute-position'
import { resolvePosition } from '@/server/services/resolve-position'
import { perfilDemo, type CarteiraDemo } from './demo-portfolios'

/** Marca de tudo que a demonstração cria. */
const PREFIXO = 'demo:'

export interface DemoSeedReport {
  posicoes: number
  lancamentos: number
}

/**
 * Monta a carteira de demonstração de um perfil.
 *
 * Idempotente pela chave de idempotência: entrar dez vezes no usuário de
 * demonstração não empilha dez carteiras. É o que permite o botão ser clicado
 * à vontade sem que a conta compartilhada vire uma pilha de duplicatas.
 *
 * Roda com `withServiceRole` porque acontece no meio do login, antes de haver
 * uma sessão de RLS estabelecida — e porque precisa gravar a moeda base do
 * tenant. Todo acesso a dado de tenant leva `tenantId` explícito no `where`.
 */
export async function semearDemo(tenantId: string, slug: 'br' | 'us'): Promise<DemoSeedReport> {
  const perfil = perfilDemo(slug)
  const relatorio: DemoSeedReport = { posicoes: 0, lancamentos: 0 }

  // O catálogo é consultado de uma vez para a leva inteira: sem ele os
  // instrumentos nascem privados e nunca recebem cotação, e a demonstração
  // ficaria com todo ativo valendo exatamente o que custou.
  type Catalogo = Awaited<ReturnType<typeof findManyInCatalog>>
  const porClasse = new Map<string, Catalogo>()

  for (const carteira of perfil.carteiras) {
    const encontrados = await findManyInCatalog(
      carteira.classSlug,
      carteira.posicoes.map((p) => p.symbol),
    )
    porClasse.set(carteira.classSlug, encontrados)
  }

  await withServiceRole(async (tx) => {
    // A moeda base governa todo o cálculo consolidado. O perfil global existe
    // justamente para mostrar o patrimônio em dólar.
    await tx
      .update(tenant)
      .set({ baseCurrency: perfil.baseCurrency })
      .where(eq(tenant.id, tenantId))

    const tocadas = new Set<string>()

    for (const carteira of perfil.carteiras) {
      const catalogo = porClasse.get(carteira.classSlug) ?? new Map()

      for (const item of carteira.posicoes) {
        const chave = `${PREFIXO}${perfil.slug}:${carteira.classSlug}:${item.symbol}`
        if (await jaExiste(tx, chave)) continue

        const { positionId } = await resolvePosition(
          tx,
          tenantId,
          {
            classSlug: carteira.classSlug,
            walletName: carteira.wallet,
            symbol: item.symbol,
            name: item.name,
            openedAt: item.occurredAt,
          },
          catalogo.get(item.symbol.toUpperCase()) ?? null,
        )

        relatorio.posicoes += 1
        relatorio.lancamentos += await gravarPosicao(tx, tenantId, positionId, carteira, item, chave)
        tocadas.add(positionId)
      }
    }

    for (const positionId of tocadas) await recomputePosition(tx, positionId)
  })

  return relatorio
}

/** A compra e, quando a classe não tem mercado, a avaliação atual. */
async function gravarPosicao(
  tx: Tx,
  tenantId: string,
  positionId: string,
  carteira: CarteiraDemo,
  item: CarteiraDemo['posicoes'][number],
  chave: string,
): Promise<number> {
  const definition = assetClassConfig(carteira.classSlug)
  const rate = carteira.currency === 'USD' ? money(carteira.fxRate ?? '0') : money(1)

  if (rate.isZero() || rate.isNegative()) {
    throw new Error(`Carteira ${carteira.wallet} em dólar sem câmbio definido.`)
  }

  const quantity = money(item.quantity)
  // O ledger vive em reais: o custo em dólar é convertido pelo câmbio da data
  // e fica assim para sempre. A moeda digitada e a taxa ficam guardadas no
  // lançamento, então o valor original nunca se perde.
  const unitCost = convertMoney(money(item.unitCost), carteira.currency, 'BRL', rate)
  const gross = quantity.times(unitCost)

  await tx.insert(transaction).values({
    tenantId,
    positionId,
    type: 'BUY',
    occurredAt: new Date(`${item.occurredAt}T12:00:00Z`),
    quantity: quantity.toFixed(10),
    unitPrice: unitCost.toFixed(10),
    grossAmount: gross.toFixed(10),
    netAmount: gross.toFixed(10),
    currency: carteira.currency,
    fxRate: rate.toFixed(10),
    source: 'IMPORT',
    idempotencyKey: chave,
    notes: 'Carteira de demonstração.',
  })

  let lancamentos = 1

  // Imóvel, renda fixa e afins não têm cotação de mercado: o valor atual é uma
  // avaliação do dono, e é a tabela `valuation` que a modela. Classes cotadas
  // não recebem nada aqui — a sincronização traz o preço real.
  if (item.unitValue && definition.valuationMode !== 'QUANTITATIVE') {
    await tx.insert(valuation).values({
      tenantId,
      positionId,
      valuedAt: new Date().toISOString().slice(0, 10),
      value: convertMoney(money(item.unitValue), carteira.currency, 'BRL', rate).toFixed(10),
      currency: 'BRL',
      method: 'MANUAL',
      notes: 'Carteira de demonstração.',
    })

    lancamentos += 1
  }

  return lancamentos
}

/** Se o perfil já foi montado. Evita refazer o trabalho a cada login. */
export async function demoJaSemeado(tenantId: string): Promise<boolean> {
  return withServiceRole(async (tx) => {
    const [row] = await tx
      .select({ id: position.id })
      .from(position)
      .where(eq(position.tenantId, tenantId))
      .limit(1)

    return Boolean(row)
  })
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
