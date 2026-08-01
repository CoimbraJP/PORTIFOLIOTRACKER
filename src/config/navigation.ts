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

/**
 * Itens que só o operador vê.
 *
 * Lista separada, e não uma flag em `NAVIGATION`, porque a decisão de mostrar
 * acontece no servidor: a lista comum vai para o cliente sempre, e um item de
 * administração ali dentro entregaria a existência da rota a quem não deve
 * saber dela.
 */
export const MASTER_NAVIGATION: readonly NavItem[] = [
  { href: '/admin', label: 'Contas', icon: 'Users' },
]
