'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { AssetAvatar } from '@/components/data/asset-avatar'
import { Input } from '@/components/ui/input'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { searchTickers, type TickerSuggestion } from '@/server/actions/catalog'
import { cn } from '@/lib/cn'

/** Espera antes de consultar. Digitar "PETR4" não pode virar cinco consultas. */
const DEBOUNCE_MS = 220

/**
 * Campo de código com sugestão do catálogo.
 *
 * O valor continua livre: ativo obscuro que o catálogo não cobre precisa ser
 * cadastrável. O papel da sugestão é fazer o caminho certo ser o mais fácil,
 * não fechar o caminho difícil.
 */
export function TickerField({
  classSlug,
  value,
  onChange,
  onPick,
  placeholder,
  invalid,
}: {
  classSlug: AssetClassSlug
  value: string
  onChange: (value: string) => void
  /** Disparado só quando o usuário escolhe da lista — traz nome e logo junto. */
  onPick: (suggestion: TickerSuggestion) => void
  placeholder: string
  invalid?: boolean
}) {
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // Marca a escolha para não reabrir a lista logo depois de selecionar: sem
  // isso, escolher PETR4 preenche o campo, dispara a busca de novo e a lista
  // volta a cobrir o formulário.
  const escolhido = useRef<string | null>(null)

  useEffect(() => {
    const termo = value.trim()

    if (escolhido.current === termo) {
      setSuggestions([])
      setOpen(false)
      return
    }

    if (termo.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    let cancelado = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const found = await searchTickers(classSlug, termo)
        // Resposta de uma busca antiga não pode sobrescrever a atual: sem esta
        // guarda, digitar rápido mostra o resultado da letra anterior.
        if (cancelado) return

        setSuggestions(found)
        setHighlight(0)
        setOpen(found.length > 0)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [value, classSlug])

  function escolher(suggestion: TickerSuggestion) {
    escolhido.current = suggestion.symbol
    onPick(suggestion)
    setOpen(false)
    setSuggestions([])
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      // Só intercepta o Enter com a lista aberta — senão o formulário não
      // enviaria mais por teclado.
      const alvo = suggestions[highlight]
      if (alvo) {
        event.preventDefault()
        escolher(alvo)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          escolhido.current = null
          onChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(suggestions.length > 0)}
        // `mousedown` no item roda antes do blur; o atraso evita que a lista
        // feche antes do clique registrar.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid}
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
      />

      {loading ? (
        <Loader2
          size={13}
          className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-fg-subtle"
        />
      ) : null}

      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-auto rounded-md border border-line bg-raised py-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.symbol}-${suggestion.exchange ?? ''}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(suggestion)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-[120ms]',
                  index === highlight ? 'bg-accent/10' : 'hover:bg-surface',
                )}
              >
                <AssetAvatar
                  symbol={suggestion.symbol}
                  name={suggestion.name}
                  logoUrl={suggestion.logoUrl}
                  classSlug={classSlug}
                  size={22}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-fg">
                    {suggestion.symbol}
                  </span>
                  <span className="block truncate text-caption normal-case tracking-normal text-fg-subtle">
                    {suggestion.name}
                  </span>
                </span>
                {index === highlight ? (
                  <Check size={13} strokeWidth={2.4} className="shrink-0 text-accent" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
