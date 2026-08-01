'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/server/auth/supabase'
import { signInSchema, signUpSchema, toAuthEmail } from '@/server/validation/credentials'

export interface CredentialsResult {
  ok: boolean
  error?: string
}

/**
 * Cadastro sem identificação.
 *
 * O Supabase precisa de um e-mail; quando a pessoa não informa nenhum, geramos
 * um endereço interno a partir do apelido. A conta existe, a senha é real, e
 * nenhum dado pessoal foi pedido.
 *
 * Informar e-mail de recuperação muda uma coisa só, e é a que importa: ele
 * passa a SER a conta, e a redefinição de senha do Supabase funciona de
 * verdade. Sem ele, senha perdida é conta perdida — e a tela diz isso antes,
 * não depois.
 */
export async function signUpWithPassword(raw: unknown): Promise<CredentialsResult> {
  const parsed = signUpSchema.safeParse(raw)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { username, password, recoveryEmail } = parsed.data
  const email = recoveryEmail || toAuthEmail(username)

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // O apelido fica nos metadados para a interface ter como chamar a pessoa
      // sem expor o endereço interno. O gatilho do banco lê `full_name` para
      // nomear a carteira.
      data: { full_name: username, username, anonymous: !recoveryEmail },
    },
  })

  if (error) {
    return { ok: false, error: traduzir(error.message) }
  }

  redirect('/')
}

/**
 * Entrada com apelido ou e-mail.
 *
 * O mesmo campo aceita os dois: quem informou recuperação no cadastro tem o
 * e-mail como conta, quem não informou tem o apelido. Obrigar a pessoa a
 * lembrar em qual dos dois modos se cadastrou seria transferir a ela um detalhe
 * que é nosso.
 */
export async function signInWithPassword(raw: unknown): Promise<CredentialsResult> {
  const parsed = signInSchema.safeParse(raw)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: toAuthEmail(parsed.data.username),
    password: parsed.data.password,
  })

  if (error) {
    // Mensagem única para usuário inexistente e senha errada. Distinguir os dois
    // entregaria de graça a lista de quem tem conta aqui.
    return { ok: false, error: 'Usuário ou senha incorretos.' }
  }

  redirect('/')
}

/**
 * Traduz só o que dá para traduzir com certeza.
 *
 * A versão anterior transformava qualquer mensagem contendo "disabled" em
 * "Cadastro desativado no momento". Parecia gentil e era pior: mascarava
 * mensagens distintas — provedor de e-mail desligado, cadastro por e-mail
 * bloqueado, projeto pausado — sob um diagnóstico único e errado, e mandava
 * quem estava depurando procurar no lugar errado.
 *
 * Quando não há certeza, o texto original passa adiante. Mensagem em inglês é
 * ruim; mensagem traduzida para a causa errada é muito pior.
 */
function traduzir(mensagem: string): string {
  const texto = mensagem.toLowerCase()

  if (texto.includes('already registered') || texto.includes('already been registered')) {
    return 'Este usuário já existe. Escolha outro ou entre com ele.'
  }
  if (texto.includes('password') && texto.includes('least')) {
    return 'Senha muito curta. Use ao menos 8 caracteres.'
  }
  if (texto.includes('signups not allowed')) {
    return 'Cadastro desativado no Supabase (Allow new users to sign up).'
  }
  if (texto.includes('email logins are disabled') || texto.includes('email signups are disabled')) {
    return 'Provedor de e-mail desligado no Supabase (Sign In / Providers → Email).'
  }

  return mensagem
}
