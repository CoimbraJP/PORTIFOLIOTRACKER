'use client'

import { useState } from 'react'
import { assetClass } from '@/config/asset-classes'
import type { AssetClassSlug } from '@/core/types/portfolio'
import { cn } from '@/lib/cn'

export interface AssetAvatarProps {
  symbol: string
  name?: string
  /** Logo do provider. Nulo em imóveis, empréstimos e empresas — eles não têm. */
  logoUrl?: string | null
  classSlug: AssetClassSlug
  size?: number
  className?: string
}

/**
 * Identidade visual do ativo.
 *
 * Quando existe logo, mostra o logo. Quando não existe — ou quando ele falha em
 * carregar — cai num monograma tingido pela cor da classe. O fallback não é
 * consolo: em Imóveis, Empréstimos e Empresas ele é a aparência definitiva,
 * porque esses ativos simplesmente não têm marca. Precisa parecer intencional.
 *
 * Usa `<img>` em vez de `next/image` de propósito: são ícones de 24–32px vindos
 * de dezenas de CDNs diferentes. Passar cada um pelo otimizador custaria mais do
 * que a imagem, e obrigaria a listar todo domínio novo em `remotePatterns`.
 */
export function AssetAvatar({
  symbol,
  name,
  logoUrl,
  classSlug,
  size = 32,
  className,
}: AssetAvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(logoUrl) && !failed

  const tint = monogramTint(symbol, assetClass(classSlug).colorVar)
  const monogram = toMonogram(symbol)

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'ring-1 ring-inset ring-line',
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: showImage
          ? 'var(--color-elevated)'
          : `color-mix(in oklab, ${tint} 16%, transparent)`,
        color: tint,
      }}
      title={name ?? symbol}
    >
      {showImage ? (
        <img
          src={logoUrl as string}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="font-semibold leading-none tracking-[-0.02em]"
          // Três letras num disco de 26px pedem corpo menor que duas.
          style={{ fontSize: Math.round(size * (monogram.length >= 3 ? 0.3 : 0.36)) }}
          aria-hidden
        >
          {monogram}
        </span>
      )}
    </span>
  )
}

/**
 * O monograma é o que de fato identifica o ativo.
 *
 * Nome composto usa iniciais (APTO-PINHEIROS → AP), porque cortar daria "APT"
 * para qualquer apartamento. Ticker usa as três primeiras letras sem o sufixo
 * numérico: BBAS3 → BBA, PETR4 → PET, BTC → BTC. Duas letras seriam ambíguas
 * demais — "PE" serve a PETR4 e PENDLE ao mesmo tempo.
 */
function toMonogram(symbol: string): string {
  const parts = symbol.split(/[-\s_/]+/).filter(Boolean)
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase()
  }
  const stripped = symbol.replace(/\d+$/, '').slice(0, 3).toUpperCase()
  return stripped || symbol.slice(0, 2).toUpperCase()
}

const TINT_STEPS = [40, 52, 64, 76, 88, 100]

/**
 * Tom estável por símbolo, sempre derivado da cor da classe.
 *
 * A variação vem da mistura com o cinza de apoio, nunca de uma cor nova — a
 * paleta continua sendo a da classe. O papel do tom é dar textura à coluna,
 * não identificar: dois ativos podem cair no mesmo passo e tudo bem, porque
 * quem distingue é o monograma. Com seis passos, insistir em unicidade exigiria
 * conhecer a lista inteira e tornaria o tom instável ao adicionar um ativo.
 *
 * FNV-1a em vez de multiplicação simples: com hash fraco, BTC, SOL e ONDO
 * caíam todos no mesmo passo.
 */
function monogramTint(symbol: string, colorVar: string): string {
  let hash = 2166136261
  for (let i = 0; i < symbol.length; i++) {
    hash ^= symbol.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  const mix = TINT_STEPS[hash % TINT_STEPS.length]
  return `color-mix(in oklab, ${colorVar} ${mix}%, var(--color-fg-subtle))`
}
