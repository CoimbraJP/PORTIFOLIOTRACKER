import type { Route } from 'next'

export interface NavItem {
  /** Tipado: `typedRoutes` valida no build que a rota existe. */
  href: Route
  label: string
  icon: string
}

export const NAVIGATION: readonly NavItem[] = [
  { href: '/', label: 'Visão geral', icon: 'LayoutDashboard' },
  { href: '/carteiras', label: 'Carteiras / Classes', icon: 'Wallet' },
  { href: '/historico', label: 'Histórico', icon: 'ArrowLeftRight' },
  { href: '/proventos', label: 'Renda passiva', icon: 'Coins' },
  { href: '/configuracoes', label: 'Configurações', icon: 'Settings' },
]
