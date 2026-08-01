'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/server/auth/supabase'

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
