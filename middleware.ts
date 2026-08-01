import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/erro']

/**
 * Renova a sessão a cada navegação e barra rota privada sem usuário.
 *
 * O middleware é o único lugar do fluxo que pode escrever cookie com segurança
 * durante um render, então é aqui que o token renovado é persistido. Server
 * Components leem a sessão, mas não conseguem gravá-la.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Falta de configuração precisa DIZER o que falta.
  //
  // Sem esta guarda, `createServerClient(undefined, undefined)` lança dentro do
  // middleware e a plataforma responde `MIDDLEWARE_INVOCATION_FAILED` — um erro
  // que não aponta para lugar nenhum e manda o desenvolvedor procurar bug no
  // código quando o problema é uma variável ausente no painel.
  if (!url || !anonKey) {
    return new NextResponse(
      'Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY nas variáveis de ambiente e refaça o deploy.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser valida o token contra o servidor de auth. Não trocar por
  // getSession: ele apenas lê o cookie, que é dado vindo do cliente.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserva o destino para voltar depois do login.
    url.searchParams.set('proximo', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto estáticos e imagens. O middleware roda em toda navegação,
     * então o que ele não precisa ver fica de fora por performance.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
