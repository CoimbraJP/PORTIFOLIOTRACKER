import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} não definida. Copie .env.example para .env.local.`)
  return value
}

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * O `try/catch` no `setAll` não é preguiça: Server Components não podem
 * escrever cookie. Quando o token é renovado durante um render, a gravação
 * falha aqui e é o middleware que persiste a sessão nova. Sem esse silêncio,
 * toda revalidação de token quebraria a página.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Render de Server Component: o middleware cuida da persistência.
          }
        },
      },
    },
  )
}
