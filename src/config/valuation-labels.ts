import type { ValuationMode } from '@/core/types/portfolio'

export interface ValuationLabels {
  /** Rótulo da coluna de quantidade. `null` esconde a coluna. */
  quantity: string | null
  /** O que o custo unitário significa nesta classe. */
  unitCost: string
  /** O que o valor unitário atual significa nesta classe. */
  unitValue: string
  /** Texto do botão de adicionar. */
  addAction: string
}

/**
 * Um imóvel não tem "preço médio" e um empréstimo não tem "cotação".
 * A mesma tabela serve as três, com os rótulos certos em cada uma.
 */
export const VALUATION_LABELS: Record<ValuationMode, ValuationLabels> = {
  QUANTITATIVE: {
    quantity: 'Quantidade',
    unitCost: 'Preço médio',
    unitValue: 'Preço atual',
    addAction: 'Adicionar ativo',
  },
  VALUATED: {
    quantity: null,
    unitCost: 'Valor de compra',
    unitValue: 'Avaliação atual',
    addAction: 'Adicionar bem',
  },
  ACCRUAL: {
    quantity: null,
    unitCost: 'Principal',
    unitValue: 'Valor acumulado',
    addAction: 'Adicionar contrato',
  },
}
