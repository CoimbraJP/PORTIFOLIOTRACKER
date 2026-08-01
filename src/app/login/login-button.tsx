'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export function LoginButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const params = useSearchParams()
  const next = params.get('proximo') ?? '/'

  async function handleLogin() {
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?proximo=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // Sem else: em caso de sucesso o browser já está navegando para o Google.
  }

  return (
    <div>
      <Button
        variant="primary"
        size="lg"
        onClick={handleLogin}
        disabled={loading}
        className="w-full"
      >
        <GoogleMark />
        {loading ? 'Redirecionando…' : 'Entrar com Google'}
      </Button>

      {error ? (
        <p className="mt-4 rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Marca oficial do Google.
 *
 * Única exceção à regra "nenhum hexadecimal fora de tokens.css": são as cores
 * exigidas pelas diretrizes de marca do Google. Tokenizá-las sugeriria que
 * pertencem à paleta do produto — não pertencem, e não podem ser alteradas.
 */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.1 0 5.71-1.03 7.62-2.78l-3.72-2.9c-1.03.7-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.71v2.99A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.83H1.71a11.5 11.5 0 0 0 0 10.34l3.84-2.99Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.08c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.63 15.1.5 12 .5A11.5 11.5 0 0 0 1.71 6.83l3.84 2.99C6.46 7.1 9 5.08 12 5.08Z"
      />
    </svg>
  )
}
