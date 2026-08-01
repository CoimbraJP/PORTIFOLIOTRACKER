import 'server-only'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { money, sum, type Money } from '@/core/money/decimal'
import { convertMoney, type DisplaySettings } from '@/core/money/display'
import { formatMoney, formatShare, type CurrencyCode } from '@/core/money/format'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { withRls } from '@/db/rls'
import { assetClass, instrument, position, transaction, wallet } from '@/db/schema'
import { loadDisplaySettings } from './display-settings'

/** Tipos de lançamento que representam renda recebida. */
const INCOME_TYPES = ['DIVIDEND', 'JCP', 'INCOME', 'RENT', 'INTEREST', 'STAKING'] as const

const TYPE_LABEL: Record<string, string> = {
  DIVIDEND: 'Dividendo',
  JCP: 'JCP',
  INCOME: 'Rendimento',
  RENT: 'Aluguel',
  INTEREST: 'Juros',
  STAKING: 'Staking',
}

export interface MonthlyIncome {
  /** `2026-07`. */
  month: string
  label: string
  total: number
  totalText: string
}

export interface YearlyIncome {
  year: string
  total: number
  totalText: string
  /** Quanto cresceu sobre o ano anterior. Nulo no primeiro ano da série. */
  changePct: string | null
  positive: boolean
}

export interface IncomeByAsset {
  symbol: string
  name: string
  logoUrl: string | null
  classSlug: AssetClassSlug
  className: string
  totalText: string
  total: number
  /** Renda acumulada sobre o custo de aquisição. O Yield on Cost. */
  yieldOnCost: string | null
  shareText: string
}

export interface IncomeEntryView {
  id: string
  date: string
  dateLabel: string
  symbol: string
  logoUrl: string | null
  typeLabel: string
  /** Imposto retido, quando houve. Só o JCP tem. */
  taxesText: string | null
  amountText: string
  automatic: boolean
}

export interface IncomeSummary {
  currency: CurrencyCode
  totalText: string
  /** Média dos últimos doze meses com movimento. */
  monthlyAverageText: string
  last12MonthsText: string
  yieldOnCostText: string | null
  monthly: MonthlyIncome[]
  yearly: YearlyIncome[]
  byAsset: IncomeByAsset[]
  recent: IncomeEntryView[]
  /** Anos disponíveis, do mais recente para o mais antigo. */
  years: string[]
}

/**
 * Renda passiva consolidada.
 *
 * Lê os LANÇAMENTOS de provento, não os eventos de mercado: o evento diz quanto
 * a empresa pagou por ação, o lançamento diz quanto ESTA posição recebeu. Só o
 * segundo é patrimônio de quem está olhando.
 *
 * Tudo em `Decimal` e no servidor. O cliente recebe texto já formatado — quem
 * soma dinheiro aqui é o domínio (CLAUDE.md §2.5).
 */
export async function loadIncome(
  userId: string,
  tenantId: string,
  year?: string,
): Promise<IncomeSummary> {
  const display = await loadDisplaySettings(tenantId)

  const rows = await withRls(userId, (tx) =>
    tx
      .select({
        id: transaction.id,
        type: transaction.type,
        occurredAt: transaction.occurredAt,
        netAmount: transaction.netAmount,
        taxes: transaction.taxes,
        currency: transaction.currency,
        source: transaction.source,
        symbol: instrument.symbol,
        name: instrument.name,
        logoUrl: instrument.logoUrl,
        classSlug: assetClass.slug,
        className: assetClass.name,
        totalCost: position.totalCost,
        positionId: position.id,
      })
      .from(transaction)
      .innerJoin(position, eq(transaction.positionId, position.id))
      .innerJoin(instrument, eq(position.instrumentId, instrument.id))
      .innerJoin(wallet, eq(position.walletId, wallet.id))
      .innerJoin(assetClass, eq(wallet.assetClassId, assetClass.id))
      // Filtro de tenant explícito, além do RLS. Ver `loadPositions`.
      .where(
        and(
          eq(transaction.tenantId, tenantId),
          inArray(transaction.type, [...INCOME_TYPES]),
          isNull(transaction.deletedAt),
          isNull(position.deletedAt),
        ),
      )
      .orderBy(asc(transaction.occurredAt)),
  )

  const base = display.base

  // O lançamento guarda a moeda em que a renda entrou. Dividendo da Apple vem
  // em dólar, e somá-lo cru ao dividendo do BBAS3 daria um número sem sentido.
  const toBase = (value: string, from: string) =>
    convertMoney(money(value), from === 'USD' ? 'USD' : 'BRL', base, display.usdBrl)

  const anos = [...new Set(rows.map((r) => r.occurredAt.toISOString().slice(0, 4)))].sort().reverse()
  const filtradas = year ? rows.filter((r) => r.occurredAt.toISOString().startsWith(year)) : rows

  const total = sum(filtradas.map((r) => toBase(r.netAmount, r.currency)))

  return {
    currency: base,
    totalText: formatMoney(total, base),
    ...janelaDeDozeMeses(rows, toBase, base),
    yieldOnCostText: yieldOnCost(rows, filtradas, toBase, display),
    monthly: porMes(filtradas, toBase, base),
    yearly: porAno(rows, toBase, base),
    byAsset: porAtivo(filtradas, toBase, base, total, display),
    recent: recentes(filtradas, toBase, base),
    years: anos,
  }
}

type ToBase = (value: string, from: string) => Money

function porMes(rows: Row[], toBase: ToBase, currency: CurrencyCode): MonthlyIncome[] {
  const acumulado = new Map<string, Money>()

  for (const row of rows) {
    const mes = row.occurredAt.toISOString().slice(0, 7)
    acumulado.set(mes, (acumulado.get(mes) ?? money(0)).plus(toBase(row.netAmount, row.currency)))
  }

  return [...acumulado]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valor]) => ({
      month,
      label: rotuloMes(month),
      total: valor.toNumber(),
      totalText: formatMoney(valor, currency),
    }))
}

function porAno(rows: Row[], toBase: ToBase, currency: CurrencyCode): YearlyIncome[] {
  const acumulado = new Map<string, Money>()

  for (const row of rows) {
    const ano = row.occurredAt.toISOString().slice(0, 4)
    acumulado.set(ano, (acumulado.get(ano) ?? money(0)).plus(toBase(row.netAmount, row.currency)))
  }

  const ordenado = [...acumulado].sort(([a], [b]) => a.localeCompare(b))

  return ordenado.map(([year, valor], index) => {
    const anterior = index > 0 ? ordenado[index - 1]?.[1] : undefined
    // Sem ano anterior, ou com ano anterior zerado, não existe variação: um
    // crescimento "infinito" seria pior do que não mostrar nada.
    const comparavel = anterior && !anterior.isZero()

    const variacao = comparavel ? valor.minus(anterior).dividedBy(anterior).times(100) : null

    return {
      year,
      total: valor.toNumber(),
      totalText: formatMoney(valor, currency),
      changePct: variacao ? formatShare(variacao) : null,
      positive: variacao ? variacao.greaterThanOrEqualTo(0) : true,
    }
  })
}

function porAtivo(
  rows: Row[],
  toBase: ToBase,
  currency: CurrencyCode,
  total: Money,
  display: DisplaySettings,
): IncomeByAsset[] {
  const acumulado = new Map<string, { row: Row; valor: Money }>()

  for (const row of rows) {
    const atual = acumulado.get(row.symbol)
    const valor = toBase(row.netAmount, row.currency)
    acumulado.set(row.symbol, { row, valor: (atual?.valor ?? money(0)).plus(valor) })
  }

  // O custo é por POSIÇÃO, e o mesmo ativo pode estar em várias carteiras.
  // Somar o custo de cada posição uma única vez evita inflar o denominador do
  // Yield on Cost e fazer o rendimento parecer menor do que é.
  const custoPorSimbolo = custoUnico(rows, display)

  return [...acumulado.values()]
    .sort((a, b) => b.valor.comparedTo(a.valor))
    .map(({ row, valor }) => {
      const custo = custoPorSimbolo.get(row.symbol)

      return {
        symbol: row.symbol,
        name: row.name,
        logoUrl: row.logoUrl,
        classSlug: row.classSlug as AssetClassSlug,
        className: row.className,
        total: valor.toNumber(),
        totalText: formatMoney(valor, currency),
        yieldOnCost:
          custo && !custo.isZero() ? formatShare(valor.dividedBy(custo).times(100)) : null,
        shareText: total.isZero() ? '0%' : formatShare(valor.dividedBy(total).times(100)),
      }
    })
}

function yieldOnCost(
  todas: Row[],
  filtradas: Row[],
  toBase: ToBase,
  display: DisplaySettings,
): string | null {
  const custoTotal = sum([...custoUnico(todas, display).values()])
  if (custoTotal.isZero()) return null

  const renda = sum(filtradas.map((r) => toBase(r.netAmount, r.currency)))
  return formatShare(renda.dividedBy(custoTotal).times(100))
}

/** Custo de aquisição por símbolo, contando cada posição uma vez só. */
function custoUnico(rows: Row[], display: DisplaySettings): Map<string, Money> {
  const vistas = new Set<string>()
  const custo = new Map<string, Money>()

  for (const row of rows) {
    if (vistas.has(row.positionId)) continue
    vistas.add(row.positionId)

    // O custo é gravado na moeda de negociação do domínio; a renda já foi
    // convertida para a base. Converter aqui também mantém a divisão coerente.
    const valor = convertMoney(money(row.totalCost), 'BRL', display.base, display.usdBrl)
    custo.set(row.symbol, (custo.get(row.symbol) ?? money(0)).plus(valor))
  }

  return custo
}

function janelaDeDozeMeses(
  rows: Row[],
  toBase: ToBase,
  currency: CurrencyCode,
): { monthlyAverageText: string; last12MonthsText: string } {
  const limite = new Date()
  limite.setUTCMonth(limite.getUTCMonth() - 12)

  const recentes = rows.filter((r) => r.occurredAt >= limite)
  const total = sum(recentes.map((r) => toBase(r.netAmount, r.currency)))

  // Divide por 12 fixo, não pelos meses com movimento: dividendo é irregular, e
  // dividir pelos meses "que tiveram" inflaria a média de quem recebe uma vez
  // por ano até parecer renda mensal.
  return {
    last12MonthsText: formatMoney(total, currency),
    monthlyAverageText: formatMoney(total.dividedBy(12), currency),
  }
}

function recentes(rows: Row[], toBase: ToBase, currency: CurrencyCode): IncomeEntryView[] {
  return [...rows]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 40)
    .map((row) => {
      const imposto = money(row.taxes)

      return {
        id: row.id,
        date: row.occurredAt.toISOString().slice(0, 10),
        dateLabel: new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(row.occurredAt),
        symbol: row.symbol,
        logoUrl: row.logoUrl,
        typeLabel: TYPE_LABEL[row.type] ?? row.type,
        taxesText: imposto.isZero()
          ? null
          : formatMoney(convertMoney(imposto, 'BRL', currency, null), currency),
        amountText: formatMoney(toBase(row.netAmount, row.currency), currency),
        automatic: row.source === 'AUTO_CORPORATE_ACTION',
      }
    })
}

function rotuloMes(month: string): string {
  const [ano, mes] = month.split('-')
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, 1))
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(data)
}

type Row = {
  id: string
  type: string
  occurredAt: Date
  netAmount: string
  taxes: string
  currency: string
  source: string
  symbol: string
  name: string
  logoUrl: string | null
  classSlug: string
  className: string
  totalCost: string
  positionId: string
}
