import type { ReactNode } from 'react'
import { PrivacyProvider } from '@/components/privacy/privacy-provider'
import type { SessionUser } from '@/server/auth/types'
import { ShellProvider } from './shell-provider'
import { Sidebar, SidebarHandle } from './sidebar'

/**
 * Sem cabeçalho.
 *
 * A busca vive na lateral, o olho de privacidade fica junto do patrimônio e as
 * ações de cada tela ficam no cabeçalho da própria tela. Uma faixa horizontal
 * só para hospedar um botão era espaço gasto sem informação.
 */
export function AppShell({ children, user }: { children: ReactNode; user: SessionUser }) {
  return (
    <ShellProvider>
      <PrivacyProvider>
        <div className="flex min-h-screen">
          <Sidebar user={user} />
          <SidebarHandle />
          <main className="min-w-0 flex-1 px-6 py-8 lg:px-8">{children}</main>
        </div>
      </PrivacyProvider>
    </ShellProvider>
  )
}
