'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { signInWithPassword, signUpWithPassword } from '@/server/actions/credentials'

/**
 * Entrada e cadastro sem identificação.
 *
 * Um componente para os dois modos porque os campos são quase os mesmos e a
 * pessoa alterna entre eles o tempo todo — separar em duas rotas faria perder o
 * que já foi digitado a cada troca.
 */
export function CredentialsForm({ mode }: { mode: 'entrar' | 'criar' }) {
  const criando = mode === 'criar'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = criando
        ? await signUpWithPassword({ username, password, confirmPassword, recoveryEmail })
        : await signInWithPassword({ username, password })

      // Em caso de sucesso a ação redireciona e nada abaixo executa.
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <Field label={criando ? 'Escolha um usuário' : 'Usuário ou e-mail'}>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={criando ? 'investidor.anonimo' : 'seu usuário'}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>

      <Field label="Senha" hint={criando ? 'Ao menos 8 caracteres' : undefined}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={criando ? 'new-password' : 'current-password'}
        />
      </Field>

      {criando ? (
        <>
          <Field label="Repita a senha">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="E-mail de recuperação"
            hint="Opcional — deixe em branco para não se identificar"
          >
            <Input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="opcional"
              autoComplete="email"
            />
          </Field>

          {/* O aviso muda conforme a escolha, e aparece ANTES de cadastrar.
              Descobrir que não há recuperação no dia em que se esquece a senha
              é tarde demais. */}
          <p
            className={
              recoveryEmail.trim()
                ? 'flex items-start gap-2 text-[0.8125rem] leading-relaxed text-fg-subtle'
                : 'flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-warning'
            }
          >
            {recoveryEmail.trim() ? null : (
              <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            )}
            <span>
              {recoveryEmail.trim()
                ? 'Este e-mail será a sua conta e servirá para redefinir a senha.'
                : 'Sem e-mail, ninguém consegue devolver o acesso se você esquecer a senha — nem eu. A conta e tudo dentro dela ficam perdidas.'}
            </span>
          </p>
        </>
      ) : null}

      {error ? (
        <p className="rounded-md border border-negative/25 bg-negative/10 px-3 py-2 text-[0.8125rem] text-negative">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
      </Button>

      <div className="flex items-center justify-between pt-1">
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-[0.8125rem] text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Outras formas de entrar
        </Link>

        <Link
          href={criando ? '/login/senha' : '/login/senha?criar=1'}
          className="text-[0.8125rem] text-accent transition-opacity hover:opacity-80"
        >
          {criando ? 'Já tenho conta' : 'Criar conta'}
        </Link>
      </div>
    </form>
  )
}
