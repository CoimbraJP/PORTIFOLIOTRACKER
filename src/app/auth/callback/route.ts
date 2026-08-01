import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Troca o código do OAuth pela sessão.
 *
 * O Google devolve o usuário aqui com um `code` de uso único; esta rota o
 * converte em sessão e grava os cookies. É Route Handler, e não página, porque
 * precisa escrever cookie — Server Component não escreve.
 *
 * Os cookies são gravados DIRETAMENTE na resposta de redirect, e não no
 * `cookies()` do Next. A diferença importa: quando se escreve no `cookies()` e
 * depois se devolve uma resposta criada à parte, os `Set-Cookie` podem não
 * viajar junto. O sintoma é cruel de diagnosticar — o login "funciona", o
 * navegador segue para a home sem sessão, o middleware não vê usuário e devolve
 * para a tela de login, como se nada tivesse acontecido.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('proximo') ?? '/'
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(oauthError)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=codigo-ausente`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?erro=configuracao-ausente`)
  }

  // Destino só pode ser caminho interno: aceitar URL absoluta abriria redirect
  // aberto, que é vetor clássico de phishing.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  // A resposta nasce ANTES da troca, para receber os cookies da sessão.
  const response = NextResponse.redirect(`${origin}${safeNext}`)

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(error.message)}`)
  }

  return response
}
