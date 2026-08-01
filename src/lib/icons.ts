import {
  ArrowLeftRight,
  Bitcoin,
  Box,
  Briefcase,
  Building2,
  Coins,
  Gem,
  Globe,
  Globe2,
  HandCoins,
  Home,
  Landmark,
  Layers,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Registro explícito de ícones.
 *
 * Nomes vêm de configuração (`config/asset-classes.ts`, `config/navigation.ts`),
 * então o mapa precisa ser estático — import dinâmico por string quebraria o
 * tree-shaking e traria a biblioteca inteira para o bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Bitcoin,
  Box,
  Briefcase,
  Building2,
  Coins,
  Gem,
  Globe,
  Globe2,
  HandCoins,
  Home,
  Landmark,
  Layers,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Upload,
  Users,
  Wallet,
}

export function icon(name: string): LucideIcon {
  return ICONS[name] ?? Box
}
