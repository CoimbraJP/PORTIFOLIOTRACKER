import 'server-only'

import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { money, type Money } from '@/core/money/decimal'
import { convertMoney, type DisplaySettings } from '@/core/money/display'
import type { CurrencyCode } from '@/core/money/format'
import type { AssetClassSlug, Position, ValuationMode } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import {
  assetClass,
  instrument,
  instrumentLogoOverride,
  position,
  quote,
  valuation,
  wallet,
} from '@/db/schema'
import type { WalletMeta } from '@/core/consolidation/by-wallet'

export interface LoadedPortfolio {
  positions: Position[]
  wallets: WalletMeta[]
  /** Instrumentos sem cotação: a UI avisa em vez de fingir lucro zero. */
  missingQuotes: string[]
}

/**
 * Carrega as posições do tenant com tudo que a consolidação precisa.
 *
 * Três consultas em vez de uma: posições com joins, última cotação por
 * instrumento e última avaliação por posição. Fazer tudo num SELECT só exigiria
 * dois LATERAL aninhados, ficaria ilegível, e o ganho seria de um round trip —
 * irrelevante perto do custo de manutenção.
 *
 * Tudo dentro de `withRls`: o banco recusa linha de outro tenant mesmo que o
 * `where` daqui esteja errado. E o `where` daqui filtra por tenant mesmo que o
 * RLS falhe. As duas camadas existem justamente porque cada uma cobre a falha
 * da outra.
 */
export async function loadPositions(
  userId: string,
  tenantId: string,
  display: DisplaySettings,
): Promise<LoadedPortfolio> {
  return withRls(userId, async (tx) => {
    const rows = await tx
      .select({
        positionId: position.id,
        quantity: position.quantity,
        avgPrice: position.avgPrice,
        totalCost: position.totalCost,
        totalInvested: position.totalInvested,
        realizedPnl: position.realizedPnl,
        incomeTotal: position.incomeTotal,
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        logoUrl: instrument.logoUrl,
        currency: instrument.currency,
        walletId: wallet.id,
        walletName: wallet.name,
        walletKind: wallet.kind,
        classSlug: assetClass.slug,
        valuationMode: assetClass.valuationMode,
      })
      .from(position)
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      // O filtro de tenant é EXPLÍCITO, além do RLS.
      //
      // A promessa do projeto são duas camadas independentes de isolamento
      // (CLAUDE.md §2.3), e esta consulta tinha só uma: sem `where`, ela
      // devolvia o que a policy deixasse passar. Basta o wrapper de RLS falhar
      // — uma transação que não abriu, um papel com BYPASSRLS — para a carteira
      // de todo mundo aparecer na tela de qualquer um.
      //
      // Com as duas, é preciso que AS DUAS falhem para vazar.
      // Posição zerada fica de fora das telas de patrimônio.
      //
      // Ela NÃO é apagada — vender tudo é fato econômico, e o lucro realizado,
      // os lançamentos e o histórico continuam lá (CLAUDE.md §2.9). O que ela
      // não é mais é patrimônio: listar um ativo com quantidade zero entre o
      // que a pessoa possui faz a lista mentir sobre o presente.
      //
      // `> 0` e não `<> 0`: quantidade negativa é sinal de erro no ledger, e
      // esconder isso da tela esconderia o próprio defeito.
      .where(
        and(
          eq(position.tenantId, tenantId),
          isNull(position.deletedAt),
          isNull(wallet.deletedAt),
          gt(position.quantity, '0'),
        ),
      )

    if (rows.length === 0) {
      return { positions: [], wallets: [], missingQuotes: [] }
    }

    // Última cotação por instrumento. `distinct on` é específico do Postgres e
    // resolve isso sem subquery correlacionada.
    //
    // Ordena por `created_at`, NÃO por `as_of`. São coisas diferentes: `as_of` é
    // quando o preço era verdadeiro no mercado, `created_at` é quando nós o
    // gravamos. Fonte com atraso devolve um preço real carimbado horas atrás —
    // ordenar por `as_of` fazia ele perder para qualquer cotação inserida
    // depois, inclusive a falsa do seed. A última coisa que gravamos é o que
    // sabemos hoje.
    const quotes = await tx
      .selectDistinctOn([quote.instrumentId], {
        instrumentId: quote.instrumentId,
        price: quote.price,
        currency: quote.currency,
      })
      .from(quote)
      .orderBy(quote.instrumentId, desc(quote.createdAt))

    // A cotação é gravada na moeda em que o ativo é NEGOCIADO: a CoinGecko e a
    // BRAPI devolvem BRL, a Twelve Data devolve USD. Trazer tudo para a moeda de
    // negociação do domínio aqui é o que impede uma ação de US$ 200 entrar na
    // soma como se valesse R$ 200.
    //
    // A conversão é na LEITURA, não na gravação: guardar já convertido apagaria
    // o preço real do ativo e o deixaria preso a um câmbio antigo.
    const priceByInstrument = new Map<string, string>()

    for (const q of quotes) {
      const origem = asCurrency(q.currency)

      // Cotação estrangeira sem câmbio conhecido é DESCARTADA, não usada crua.
      //
      // `convertMoney` devolve o valor original quando não sabe a taxa — certo
      // para exibição, catastrófico aqui: a Apple entraria no patrimônio a
      // R$ 230 em vez de R$ 1.240. Descartar faz o ativo cair no fallback de
      // "sem cotação", que a tela sinaliza, em vez de corromper o total em
      // silêncio.
      if (origem !== 'BRL' && (!display.usdBrl || display.usdBrl.isZero())) continue

      priceByInstrument.set(
        q.instrumentId,
        convertMoney(money(q.price), origem, 'BRL', display.usdBrl).toString(),
      )
    }

    // Última avaliação por posição — é o preço dos ativos em modo VALUATED.
    const valuations = await tx
      .selectDistinctOn([valuation.positionId], {
        positionId: valuation.positionId,
        value: valuation.value,
      })
      .from(valuation)
      .where(isNull(valuation.deletedAt))
      .orderBy(valuation.positionId, desc(valuation.valuedAt))

    const valueByPosition = new Map(valuations.map((v) => [v.positionId, v.value]))

    // Logo escolhido pelo usuário sobrepõe o do provider. O RLS já garante que
    // só vêm os overrides deste tenant — trocar o logo do BTC aqui não afeta
    // ninguém mais.
    const overrides = await tx
      .select({
        instrumentId: instrumentLogoOverride.instrumentId,
        logoUrl: instrumentLogoOverride.logoUrl,
      })
      .from(instrumentLogoOverride)

    const logoOverrideById = new Map(overrides.map((o) => [o.instrumentId, o.logoUrl]))

    const missingQuotes: string[] = []

    const positions: Position[] = rows.map((row) => {
      const quantity = money(row.quantity)
      const avgPrice = money(row.avgPrice)
      const mode = row.valuationMode as ValuationMode

      const currentPrice = resolvePrice({
        mode,
        quantity,
        avgPrice,
        quotePrice: priceByInstrument.get(row.instrumentId),
        valuationValue: valueByPosition.get(row.positionId),
        onMissing: () => missingQuotes.push(row.symbol),
      })

      // Neste ponto tudo já está em BRL: a cotação foi normalizada acima e o
      // custo é gravado assim. Se a base do tenant for outra, o DOMÍNIO inteiro
      // passa a ser nela — assim toda soma acontece numa moeda só, e a view não
      // precisa converter agregado nenhum.
      const toBase = (v: Money) => convertMoney(v, 'BRL', display.base, display.usdBrl)

      return {
        id: row.positionId,
        symbol: row.symbol,
        name: row.name,
        walletId: row.walletId,
        walletName: row.walletName,
        classSlug: row.classSlug as AssetClassSlug,
        valuationMode: mode,
        currency: display.base,
        logoUrl: logoOverrideById.get(row.instrumentId) ?? row.logoUrl,
        quantity,
        avgPrice: toBase(avgPrice),
        totalCost: toBase(money(row.totalCost)),
        totalInvested: toBase(money(row.totalInvested)),
        currentPrice: toBase(currentPrice),
        currentValue: toBase(quantity.times(currentPrice)),
        realizedPnl: toBase(money(row.realizedPnl)),
        incomeTotal: toBase(money(row.incomeTotal)),
      }
    })

    const walletsById = new Map<string, WalletMeta>()
    for (const row of rows) {
      walletsById.set(row.walletId, {
        id: row.walletId,
        name: row.walletName,
        kind: row.walletKind,
      })
    }

    return {
      positions,
      wallets: [...walletsById.values()],
      missingQuotes: [...new Set(missingQuotes)],
    }
  })
}

/**
 * Normaliza a moeda vinda do banco.
 *
 * `quote.currency` é texto livre no schema — um provider novo pode gravar algo
 * inesperado. Cair para BRL é o comportamento seguro: é a moeda de negociação
 * do domínio, então o valor entra na soma sem multiplicação por câmbio nenhum.
 */
function asCurrency(value: string | null): CurrencyCode {
  return value === 'USD' ? 'USD' : 'BRL'
}

/**
 * De onde sai o preço atual, por modo de valoração.
 *
 * O fallback para o preço médio é deliberado: sem cotação, o ativo aparece
 * valendo o que custou — lucro zero — em vez de sumir do patrimônio ou zerar o
 * total. Errar para o lado conservador é melhor do que inventar valor, e a UI
 * sinaliza quais ativos estão nessa situação.
 */
function resolvePrice(input: {
  mode: ValuationMode
  quantity: Money
  avgPrice: Money
  quotePrice: string | undefined
  valuationValue: string | undefined
  onMissing: () => void
}): Money {
  const { mode, quantity, avgPrice, quotePrice, valuationValue, onMissing } = input

  if (mode === 'QUANTITATIVE') {
    if (quotePrice) return money(quotePrice)
    onMissing()
    return avgPrice
  }

  // VALUATED e ACCRUAL: a avaliação é do BEM inteiro, não unitária. Como a
  // quantidade é 1 nesses casos, dividir devolve o valor cheio — e continua
  // correto se algum dia houver fração.
  if (valuationValue) {
    const total = money(valuationValue)
    return quantity.isZero() ? total : total.dividedBy(quantity)
  }

  if (quotePrice) return money(quotePrice)

  onMissing()
  return avgPrice
}
