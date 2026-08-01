'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface ShellContextValue {
  /** Sidebar recolhida. Telas de classe entram recolhidas. */
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleSidebar: () => void

  /** Busca contextual — cada página decide o que ela filtra. */
  query: string
  setQuery: (value: string) => void
  placeholder: string
  setPlaceholder: (value: string) => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell precisa estar dentro de ShellProvider')
  return ctx
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [placeholder, setPlaceholder] = useState('Buscar')

  const toggleSidebar = useCallback(() => setCollapsed((v) => !v), [])

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggleSidebar, query, setQuery, placeholder, setPlaceholder }),
    [collapsed, toggleSidebar, query, placeholder],
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

/**
 * Declara o escopo da busca da página e limpa a query ao sair.
 *
 * A caixa de busca é uma só, na lateral; o que ela filtra depende de onde você
 * está. Sem isso a query de uma tela vazaria para a seguinte.
 */
export function useSearchScope(placeholder: string): string {
  const { query, setQuery, setPlaceholder } = useShell()

  useEffect(() => {
    setPlaceholder(placeholder)
    return () => {
      setQuery('')
      setPlaceholder('Buscar')
    }
  }, [placeholder, setPlaceholder, setQuery])

  return query
}

/**
 * Recolher a lateral automaticamente foi REMOVIDO.
 *
 * A tela de classe fazia isso para ganhar largura, e o efeito na prática era
 * outro: a navegação sumia sem o usuário ter pedido, e ele voltava a abri-la
 * toda vez. Movimento que a pessoa não iniciou é interpretado como defeito,
 * mesmo quando a intenção era ajudar.
 *
 * A lateral agora só se move pelo botão. Mantido como função vazia para que o
 * comportamento anterior não volte por descuido — quem tentar reativar
 * encontra este comentário antes.
 */
export function useCollapsedShell(): void {}

/** Normaliza para busca: minúsculas e sem acento. */
export function matches(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  return normalize(haystack).includes(normalize(needle))
}
