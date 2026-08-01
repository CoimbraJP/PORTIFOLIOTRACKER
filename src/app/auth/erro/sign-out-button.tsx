'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/server/actions/auth'

/**
 * Sair daqui é a única ação possível.
 *
 * Sem ela o usuário fica preso: a sessão é válida, então o middleware não deixa
 * voltar ao login, e não há nada no app para ver. Trocar de conta exige
 * derrubar a sessão primeiro.
 */
export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="secondary"
      onClick={() => startTransition(async () => void (await signOut()))}
      disabled={pending}
    >
      <LogOut size={15} strokeWidth={2} />
      {pending ? 'Saindo…' : 'Sair e tentar outra conta'}
    </Button>
  )
}
