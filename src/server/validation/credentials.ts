import { z } from 'zod'

/**
 * Domínio das identidades sem e-mail.
 *
 * O Supabase exige e-mail para login com senha — não existe cadastro só com
 * usuário. Então geramos um endereço interno a partir do nome escolhido. Ele
 * nunca é mostrado nem digitado; é detalhe de armazenamento.
 *
 * `.invalid` é reservado pela RFC 2606 justamente para isto: garante que o
 * endereço nunca vai existir de verdade, então nenhuma mensagem some no mundo
 * achando que chegou a alguém.
 */
const ANON_DOMAIN = 'anon.invalid'

/**
 * Nome de usuário.
 *
 * Minúsculas, números, ponto, hífen e sublinhado. Restrito porque vira parte de
 * um endereço de e-mail: aceitar espaço ou acento produziria um endereço
 * inválido e o cadastro falharia com uma mensagem que não ajuda ninguém.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use ao menos 3 caracteres')
  .max(32, 'Use no máximo 32 caracteres')
  .regex(/^[a-z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado')

/**
 * Senha.
 *
 * Oito caracteres é o mínimo do Supabase. Não exijo símbolo nem maiúscula: as
 * regras de composição empurram para senhas curtas e decoráveis do tipo
 * "Senha@1", enquanto o comprimento é o que realmente protege. Quem não tem
 * e-mail de recuperação depende só disto — e a tela avisa.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use ao menos 8 caracteres')
  .max(72, 'Use no máximo 72 caracteres')

export const signUpSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    /** Vazio é permitido: é justamente a opção de não se identificar. */
    recoveryEmail: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  })

export const signInSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Obrigatório'),
  password: z.string().min(1, 'Obrigatório'),
})

export type SignUpInput = z.input<typeof signUpSchema>
export type SignInInput = z.input<typeof signInSchema>

/**
 * Como o identificador digitado vira o e-mail que o Supabase entende.
 *
 * Quem digitou um e-mail no login entra por ele — é o caso de quem informou
 * recuperação no cadastro, cuja conta É o e-mail. Quem digitou um apelido entra
 * pela identidade interna. Assim o mesmo campo atende os dois, e a pessoa não
 * precisa saber em qual dos dois modos se cadastrou.
 */
export function toAuthEmail(identifier: string): string {
  const limpo = identifier.trim().toLowerCase()
  return limpo.includes('@') ? limpo : `${limpo}@${ANON_DOMAIN}`
}

/** Se a conta é anônima, ou seja, sem e-mail real por trás. */
export function isAnonymousEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${ANON_DOMAIN}`))
}

/** O apelido de volta, para exibir sem revelar o endereço interno. */
export function usernameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  return isAnonymousEmail(email) ? email.split('@')[0]! : null
}
