/**
 * Flags de produto.
 *
 * Regra: feature desligada é feature INVISÍVEL. Nada de UI meio-pronta exposta
 * ao usuário. O modelo e o cálculo podem existir; a interface não aparece.
 */
export const features = {
  /**
   * Metas e alocação-alvo (rebalanceamento).
   * Modelo e cálculo nascem prontos; a interface só aparece na Fase 7.
   */
  allocationTargets: false,

  /**
   * TWR / XIRR — rentabilidade imune a aportes.
   * Métrica correta, mas exige repertório para interpretar. Fica atrás de um
   * toggle em Configurações, desligado por padrão. Ver docs/00 §3.7.
   */
  advancedReturns: false,

  /** Importação de CSV — Fase 6. */
  csvImport: false,

  /** Comparação com CDI e IBOV — Fase 7. */
  benchmarks: false,
} as const

export type FeatureFlag = keyof typeof features
