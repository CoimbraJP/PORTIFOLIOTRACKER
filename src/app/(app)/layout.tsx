import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { requireTenant } from '@/server/auth/session'

/**
 * Área autenticada.
 *
 * `requireTenant()` roda antes de qualquer página do grupo. O middleware já
 * barra quem não tem sessão, mas a guarda aqui é o que garante que existe
 * TENANT — sessão válida sem tenant é estado possível (trigger de signup que
 * não rodou) e não pode virar uma tela meio carregada.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await requireTenant()

  return <AppShell user={context.user}>{children}</AppShell>
}
