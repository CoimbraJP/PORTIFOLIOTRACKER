'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { setMarketId } from '@/server/actions/market-id'
import type { CryptoIdRow } from '@/server/queries/crypto-ids'

const PRECO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 8,
})

/**
 * De qual moeda cada cripto está puxando preço.
 *
 * Ticker de cripto colide: existe mais de uma moeda chamada FLUID, ONDO ou
 * SOL. O catálogo guarda uma linha por símbolo e fica com a de maior valor de
 * mercado — quem tem a outra vê um preço real, de um ativo real, que não é o
 * dele. Não há como o sistema adivinhar sozinho, mas dá para mostrar o que ele
 * escolheu e deixar corrigir.
 */
export function CryptoIdPanel({ rows }: { rows: CryptoIdRow[] }) {
  if (rows.length === 0) return null

  return (
    <Card>
      <h2 className="text-[0.9375rem] font-semibold text-fg">Identificação das criptos</h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        Existe mais de uma moeda com o mesmo código — FLUID, ONDO e SOL são só alguns exemplos. Se o
        preço de alguma estiver estranho, é provável que esteja apontando para a moeda errada.
      </p>
      <p className="mt-2 text-caption normal-case leading-relaxed tracking-normal text-fg-subtle">
        O id está no fim do endereço da moeda no site da CoinGecko:
        coingecko.com/pt/moedas/<strong className="text-fg">bitcoin</strong>. A correção vale só para
        você — o catálogo é compartilhado entre todas as contas.
      </p>

      <div className="mt-6 divide-y divide-line">
        {rows.map((row) => (
          <Linha key={row.positionId} row={row} />
        ))}
      </div>
    </Card>
  )
}

function Linha({ row }: { row: CryptoIdRow }) {
  const router = useRouter()
  const [valor, setValor] = useState(row.coingeckoId ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pending, startTransition] = useTransition()

  const mudou = valor.trim().toLowerCase() !== (row.coingeckoId ?? '')

  function salvar() {
    setErro(null)
    setSalvo(false)

    startTransition(async () => {
      const resultado = await setMarketId({ positionId: row.positionId, coingeckoId: valor })

      if (resultado.ok) {
        setSalvo(true)
        router.refresh()
      } else {
        setErro(resultado.error ?? 'Não foi possível salvar.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-40 flex-1">
        <p className="text-[0.8125rem] font-medium text-fg">
          {row.symbol}
          {!row.isGlobal ? (
            <span className="ml-2 text-caption normal-case tracking-normal text-fg-subtle">
              corrigido
            </span>
          ) : null}
        </p>
        <p className="text-caption normal-case tracking-normal text-fg-subtle">
          {row.name} — {row.price ? PRECO.format(Number(row.price)) : 'sem cotação'}
        </p>
      </div>

      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="id na CoinGecko"
        aria-label={`Id da CoinGecko para ${row.symbol}`}
        className="w-52 text-left"
      />

      <Button variant="ghost" onClick={salvar} disabled={!mudou || pending}>
        {pending ? 'Salvando…' : salvo ? <Check className="size-4" aria-hidden /> : 'Salvar'}
      </Button>

      {erro ? <p className="w-full text-[0.8125rem] text-negative">{erro}</p> : null}
    </div>
  )
}
