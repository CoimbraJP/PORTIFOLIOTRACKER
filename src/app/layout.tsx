import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Patrimônio',
  description: 'Gestor de patrimônio — todos os seus ativos em um só lugar.',
}

export const viewport: Viewport = {
  // Única exceção à regra "nenhum hexadecimal fora de tokens.css": o navegador
  // lê isto antes do CSS carregar, então não pode ser uma variável.
  // Deve espelhar --color-canvas.
  themeColor: '#08090c',
}

/**
 * Raiz mínima: só documento e fontes.
 *
 * O AppShell — sidebar, busca, privacidade — vive no grupo `(app)`, para que
 * `/login` renderize sem menu nenhum. Um shell de aplicação em volta da tela de
 * entrada mostraria navegação que o visitante ainda não pode usar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
