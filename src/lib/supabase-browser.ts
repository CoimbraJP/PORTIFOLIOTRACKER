'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente do browser. Usa apenas a chave pública (`anon`), que é desenhada para
 * ficar exposta — quem decide o que ela pode ler é o RLS, não o segredo.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
