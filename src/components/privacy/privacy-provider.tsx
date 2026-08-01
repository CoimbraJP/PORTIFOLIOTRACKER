'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PrivacyContextValue {
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue>({ hidden: false, toggle: () => {} })

export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext)
}

/**
 * Modo privacidade.
 *
 * O borrão é aplicado por CSS a partir de um data-attribute — nenhum componente
 * de valor re-renderiza ao alternar. Atalho: Ctrl/⌘ + Shift + H.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)

  const toggle = useCallback(() => setHidden((v) => !v), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <PrivacyContext.Provider value={{ hidden, toggle }}>
      <div data-privacy={hidden ? 'on' : 'off'} className="contents">
        {children}
      </div>
    </PrivacyContext.Provider>
  )
}

/**
 * Fica colado no valor que ele esconde. Discreto em repouso, revelado no hover
 * do grupo — o olho não deve competir com o número.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      title={hidden ? 'Mostrar valores (⌘⇧H)' : 'Ocultar valores (⌘⇧H)'}
      className={cn(
        'rounded-sm p-1 transition-all duration-[180ms]',
        'hover:bg-raised hover:text-fg',
        hidden ? 'text-fg-muted' : 'text-fg-subtle/50 group-hover/value:text-fg-subtle',
        className,
      )}
    >
      {hidden ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
    </button>
  )
}
