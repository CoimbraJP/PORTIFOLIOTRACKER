/**
 * Tema dos gráficos.
 *
 * Recharts recebe `var(--color-…)` diretamente: variáveis CSS funcionam em
 * `fill` e `stroke` de SVG. É assim que a regra "nenhum hexadecimal em
 * componente" continua valendo dentro dos gráficos.
 */
export const chartTheme = {
  accent: 'var(--color-accent)',
  accentDim: 'var(--color-accent-dim)',
  grid: 'var(--color-line)',
  axis: 'var(--color-fg-subtle)',
  positive: 'var(--color-positive)',
  negative: 'var(--color-negative)',
  surface: 'var(--color-surface)',
} as const

export const AXIS_TICK = {
  fill: 'var(--color-fg-subtle)',
  fontSize: 11,
  fontWeight: 500,
} as const

/** Ordem estável de fatias no donut, seguindo a ordem canônica das classes. */
export const CHART_ANIMATION_DURATION = 900
