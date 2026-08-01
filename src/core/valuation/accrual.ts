import { money, type Money } from '../money/decimal'

export type Indexer = 'CDI' | 'IPCA+' | 'Prefixado' | 'SELIC'

export interface AccrualInput {
  /** Valor aplicado ou emprestado. */
  principal: Money
  /** Taxa contratada, em pontos percentuais. */
  rate: Money
  /** Se a taxa é ao mês ou ao ano. */
  period: 'MONTHLY' | 'YEARLY'
  startDate: Date
  /** Data da avaliação. Padrão: hoje. */
  asOf?: Date
}

const DAYS_IN_YEAR = 365
const DAYS_IN_MONTH = 30

/**
 * Valor acumulado de renda fixa e empréstimo a juros.
 *
 * Juros COMPOSTOS e proporcionais aos dias corridos:
 *
 *     valor = principal × (1 + taxa) ^ (dias / diasDoPeríodo)
 *
 * Duas escolhas que valem explicação:
 *
 * **Composto, não simples.** É como CDB, LCI e empréstimo com correção
 * funcionam de verdade. Juros simples subestimariam o valor em qualquer prazo
 * relevante — num contrato de 2 anos a 1% a.m., a diferença passa de 6%.
 *
 * **Dias corridos, não meses cheios.** Um contrato iniciado dia 20 não pode
 * pular de zero para um mês inteiro de juros na virada. A proporção diária faz
 * o valor crescer suavemente, que é o que o usuário vê no extrato do banco.
 *
 * Não cobre indexadores pós-fixados de verdade: CDI e IPCA variam dia a dia e
 * exigiriam a série histórica do índice. Para eles, `rate` deve ser a taxa
 * efetiva estimada — e é por isso que `estimateAccrued` é o nome, não
 * `calculateAccrued`.
 */
export function estimateAccrued(input: AccrualInput): Money {
  const asOf = input.asOf ?? new Date()
  const days = daysBetween(input.startDate, asOf)

  if (days <= 0) return input.principal

  const periodDays = input.period === 'MONTHLY' ? DAYS_IN_MONTH : DAYS_IN_YEAR
  const exponent = days / periodDays
  const growth = money(1).plus(input.rate.dividedBy(100))

  return input.principal.times(growth.toPower(exponent))
}

/** Só os juros, sem o principal. */
export function accruedInterest(input: AccrualInput): Money {
  return estimateAccrued(input).minus(input.principal)
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / 86_400_000)
}

/**
 * Lê os campos de juros do `custom_fields` da posição.
 *
 * Devolve `null` quando o contrato não tem taxa ou data — nesse caso o valor
 * vem da última reavaliação manual, e forçar um cálculo com dado faltando
 * inventaria rendimento.
 */
export function readAccrualFields(
  fields: Record<string, unknown>,
): { rate: Money; period: 'MONTHLY' | 'YEARLY'; startDate: Date } | null {
  const rawRate = fields.rate
  const rawDate = fields.startDate ?? fields.date

  if (rawRate === undefined || rawRate === null || rawRate === '') return null
  if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return null

  const rate = money(String(rawRate).replace(',', '.'))
  if (rate.isNaN() || rate.lessThanOrEqualTo(0)) return null

  // Empréstimos usam taxa ao mês; renda fixa, ao ano. O rótulo do campo em
  // `config/asset-classes.ts` diz "(a.m.)" para empréstimo.
  const period = fields.ratePeriod === 'YEARLY' ? 'YEARLY' : 'MONTHLY'

  return { rate, period, startDate: new Date(`${rawDate}T12:00:00Z`) }
}
