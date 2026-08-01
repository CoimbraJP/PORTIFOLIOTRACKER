import 'server-only'

import { getSessionUser } from './session'

/**
 * Quem é o operador do sistema.
 *
 * Vem de variável de ambiente, e não de constante no código, por dois motivos:
 * o repositório pode ser público, e um e-mail pessoal cravado ali vira alvo de
 * spam; e trocar o operador não deveria exigir um deploy.
 *
 * Aceita lista separada por vírgula. Sem a variável definida, NINGUÉM é
 * operador — falta de configuração fecha a porta em vez de abri-la.
 */
function masterEmails(): string[] {
  return (process.env.MASTER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Se o usuário da requisição opera o sistema. Resolvido no SERVIDOR. */
export async function isMaster(): Promise<boolean> {
  const user = await getSessionUser()
  const email = user?.email?.toLowerCase()

  if (!email) return false
  return masterEmails().includes(email)
}

/**
 * Interrompe a ação quando quem chama não é operador.
 *
 * Toda Server Action restrita chama isto no início. Esconder o botão na
 * interface não protege nada: a Server Action continua sendo um endpoint, e
 * quem souber o nome dela pode chamá-la direto.
 */
export async function requireMaster(): Promise<void> {
  if (!(await isMaster())) {
    throw new Error('Esta ação é restrita ao operador do sistema.')
  }
}
