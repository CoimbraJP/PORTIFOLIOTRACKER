import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/server/auth/supabase'

/**
 * Troca o código do OAuth pela sessão.
 *
 * O Google devolve o usuário aqui com um `code` de uso único; esta rota o
 * converte em sessão e grava os cookies. É Route Handler, e não página, porque
 * precisa escrever cookie — Server Component não escreve.
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

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(error.message)}`)
  }

  // Destino só pode ser caminho interno: aceitar URL absoluta abriria redirect
  // aberto, que é vetor clássico de phishing.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  return NextResponse.redirect(`${origin}${safeNext}`)
}
