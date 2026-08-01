'use client'

import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import type { ClassWorkspaceView } from '@/core/view/class-workspace-view'
import { formatDecimalInput } from '@/core/money/parse'
import { isKnownTicker } from '@/server/actions/catalog'
import type { TickerSuggestion } from '@/server/actions/catalog'
import type { NewPositionInput } from '@/server/validation/position'
import { PositionSummary, type PositionDraft } from './position-summary'
import { TickerField } from './ticker-field'

const NEW_WALLET = '__new__'

export interface AddPositionDialogProps {
  open: boolean
  onClose: () => void
  workspace: ClassWorkspaceView
  onSubmit: (draft: NewPositionInput) => void
  pending: boolean
}

/**
 * Formulário de lançamento.
 *
 * Os rótulos vêm da classe: em Imóveis pede "Cidade" e "Valor de compra";
 * em Cripto pede "Carteira", "Quantidade" e "Preço médio". Mesmo formulário,
 * mesmo modelo — vocabulário diferente.
 */
export function AddPositionDialog({
  open,
  onClose,
  workspace,
  onSubmit,
  pending,
}: AddPositionDialogProps) {
  const { labels, walletTerm, assetTerm } = workspace
  const isQuantitative = labels.quantity !== null

  const [walletId, setWalletId] = useState(workspace.walletOptions[0]?.id ?? NEW_WALLET)
  const [newWalletName, setNewWalletName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [unitValue, setUnitValue] = useState('')
  const [entryCurrency, setEntryCurrency] = useState<'BRL' | 'USD'>('BRL')
  const [entryRate, setEntryRate] = useState(workspace.usdBrl ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  /**
   * `form` enquanto edita, `confirm` na revisão.
   *
   * A confirmação não é cerimônia: é onde o número interpretado aparece por
   * extenso. Foi a ausência dela que deixou um câmbio lido como 50.800 passar
   * sem ninguém notar.
   */
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [unknownTicker, setUnknownTicker] = useState(false)
  const [checking, setChecking] = useState(false)
  /**
   * Último nome que o catálogo preencheu sozinho.
   *
   * Guardar isto é o que permite distinguir "o campo está com o nome que EU
   * coloquei" de "está com o que a sugestão anterior deixou". Sem a distinção,
   * escolher Apple e depois NVDA salvava a NVIDIA com o nome da Apple — ou,
   * sobrescrevendo sempre, apagaria o apelido que o usuário digitou.
   */
  const autoPreenchido = useRef<string | null>(null)

  const creatingWallet = walletId === NEW_WALLET || workspace.walletOptions.length === 0
  const emDolar = workspace.foreignEntry && entryCurrency === 'USD'
  const prefixo = emDolar ? 'US$' : 'R$'

  function reset() {
    setSymbol('')
    setName('')
    autoPreenchido.current = null
    setQuantity('')
    setUnitCost('')
    setUnitValue('')
    setNewWalletName('')
    setStep('form')
    setUnknownTicker(false)
    // A moeda e a taxa NÃO são resetadas: quem lança um ativo em dólar
    // costuma lançar o próximo também, e redigitar o câmbio a cada vez é
    // convite a erro de digitação.
    setErrors({})
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const next: Record<string, string> = {}
    if (!symbol.trim()) next.symbol = 'Obrigatório'
    if (creatingWallet && !newWalletName.trim()) next.wallet = 'Informe um nome'
    if (isQuantitative && !quantity.trim()) next.quantity = 'Obrigatório'
    if (!unitCost.trim()) next.unitCost = 'Obrigatório'
    // Sem a taxa não dá para converter, e chutar o câmbio corromperia o custo
    // de forma silenciosa e permanente.
    if (emDolar && !entryRate.trim()) next.entryRate = 'Informe a cotação'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    // Ticker fora do catálogo não bloqueia — vira aviso na revisão. Ativo
    // obscuro precisa continuar cadastrável; o que não pode é um dígito a mais
    // em "KLBN4" passar despercebido e virar um ativo que nunca terá cotação.
    if (workspace.hasCatalog) {
      setChecking(true)
      const conhecido = await isKnownTicker(workspace.slug, symbol.trim().toUpperCase()).finally(
        () => setChecking(false),
      )
      setUnknownTicker(!conhecido)
    }

    setStep('confirm')
  }

  function confirmar() {
    onSubmit({
      classSlug: workspace.slug,
      walletId: creatingWallet ? '' : walletId,
      newWalletName: creatingWallet ? newWalletName.trim() : undefined,
      symbol: symbol.trim(),
      name: name.trim() || undefined,
      // Bens únicos (imóvel, empresa, contrato) têm sempre quantidade 1.
      quantity: isQuantitative ? quantity : '1',
      unitCost,
      unitValue: unitValue.trim() ? unitValue : undefined,
      entryCurrency: emDolar ? 'USD' : 'BRL',
      entryRate: emDolar ? entryRate : undefined,
    })

    reset()
  }

  const draft: PositionDraft = {
    symbol: symbol.trim().toUpperCase(),
    name: name.trim(),
    walletLabel: creatingWallet
      ? newWalletName.trim()
      : (workspace.walletOptions.find((o) => o.id === walletId)?.name ?? ''),
    walletTerm: walletTerm.one,
    quantity: isQuantitative ? quantity : '1',
    quantityLabel: labels.quantity,
    unitCost,
    unitCostLabel: labels.unitCost,
    entryCurrency: emDolar ? 'USD' : 'BRL',
    entryRate,
    classSlug: workspace.slug,
    unknownTicker,
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={labels.addAction}
      description={`Em ${workspace.name}. O cálculo acontece no servidor.`}
    >
      {step === 'form' ? (
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label={walletTerm.one}
          error={errors.wallet}
          hint={creatingWallet ? undefined : `Onde este ${assetTerm.one.toLowerCase()} fica guardado`}
        >
          {workspace.walletOptions.length > 0 ? (
            <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
              {workspace.walletOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={NEW_WALLET}>+ Criar {walletTerm.one.toLowerCase()}</option>
            </Select>
          ) : null}

          {creatingWallet ? (
            <Input
              value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder={placeholderForWallet(workspace.slug)}
              className={workspace.walletOptions.length > 0 ? 'mt-2' : undefined}
            />
          ) : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={isQuantitative ? 'Código' : 'Identificação'}
            error={errors.symbol}
            hint={workspace.hasCatalog ? 'Digite duas letras para ver sugestões' : undefined}
          >
            {workspace.hasCatalog ? (
              <TickerField
                classSlug={workspace.slug}
                value={symbol}
                onChange={(v) => {
                  setSymbol(v)
                  setUnknownTicker(false)
                }}
                onPick={(escolha: TickerSuggestion) => {
                  setSymbol(escolha.symbol)

                  // O nome vem junto: quem escolheu KLBN4 não deve precisar
                  // digitar "Klabin" depois. Mas só sobrescreve se o campo
                  // estiver vazio ou com um nome que a própria sugestão
                  // colocou — nome digitado à mão é do usuário e fica.
                  const atual = name.trim()
                  if (atual === '' || atual === autoPreenchido.current) {
                    setName(escolha.name)
                    autoPreenchido.current = escolha.name
                  }

                  setErrors((e) => ({ ...e, symbol: '' }))
                  setUnknownTicker(false)
                }}
                placeholder={placeholderForSymbol(workspace.slug)}
                invalid={Boolean(errors.symbol)}
              />
            ) : (
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={placeholderForSymbol(workspace.slug)}
              />
            )}
          </Field>

          <Field label="Nome" hint="Opcional">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholderForName(workspace.slug)}
            />
          </Field>
        </div>

        {workspace.foreignEntry ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field label="Moeda do lançamento" hint="Em que moeda o dinheiro saiu da conta">
              <div className="inline-flex rounded-md border border-line p-0.5">
                {(['BRL', 'USD'] as const).map((moeda) => (
                  <button
                    key={moeda}
                    type="button"
                    onClick={() => setEntryCurrency(moeda)}
                    aria-pressed={entryCurrency === moeda}
                    className={
                      entryCurrency === moeda
                        ? 'rounded-[5px] bg-accent/15 px-3 py-1.5 text-[0.8125rem] font-medium text-accent'
                        : 'rounded-[5px] px-3 py-1.5 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg'
                    }
                  >
                    {moeda === 'BRL' ? 'R$ Real' : 'US$ Dólar'}
                  </button>
                ))}
              </div>
            </Field>

            {emDolar ? (
              <Field
                label="Dólar na data da compra"
                error={errors.entryRate}
                hint="O custo fica gravado em reais por esta taxa"
              >
                <Input
                  inputMode="decimal"
                  value={entryRate}
                  onChange={(e) => setEntryRate(e.target.value)}
                  onBlur={(e) => setEntryRate(formatDecimalInput(e.target.value))}
                  placeholder="5,0800"
                  className="w-32 tabular-nums"
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {isQuantitative ? (
            <Field label={labels.quantity ?? 'Quantidade'} error={errors.quantity}>
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onBlur={(e) => setQuantity(formatDecimalInput(e.target.value))}
                placeholder="0,00"
              />
            </Field>
          ) : null}

          <Field label={`${labels.unitCost} (${prefixo})`} error={errors.unitCost}>
            <Input
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              // Formata ao SAIR do campo, não a cada tecla: reescrever o texto
              // enquanto a pessoa digita move o cursor e atrapalha a correção.
              onBlur={(e) => setUnitCost(formatDecimalInput(e.target.value))}
              placeholder="0,00"
            />
          </Field>

          <Field label={`${labels.unitValue} (${prefixo})`} hint="Vazio = usa o custo">
            <Input
              inputMode="decimal"
              value={unitValue}
              onChange={(e) => setUnitValue(e.target.value)}
              onBlur={(e) => setUnitValue(formatDecimalInput(e.target.value))}
              placeholder="0,00"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={checking}>
            {checking ? 'Conferindo…' : 'Revisar'}
          </Button>
        </div>
      </form>
      ) : (
        <div className="space-y-5">
          <PositionSummary draft={draft} />

          <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
            {/* Voltar preserva tudo que foi digitado: quem revisou e viu um
                número errado precisa corrigir aquele campo, não recomeçar. */}
            <Button type="button" variant="ghost" onClick={() => setStep('form')} disabled={pending}>
              Voltar e editar
            </Button>
            <Button type="button" variant="primary" onClick={confirmar} disabled={pending}>
              {pending ? 'Gravando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}


function placeholderForWallet(slug: string): string {
  if (slug === 'imoveis') return 'Campinas'
  if (slug === 'cripto') return 'Ledger'
  if (slug === 'emprestimos') return 'Ricardo M.'
  if (slug === 'renda-fixa') return 'Banco Inter'
  return 'XP'
}

function placeholderForSymbol(slug: string): string {
  if (slug === 'imoveis') return 'APTO-CENTRO'
  if (slug === 'cripto') return 'BTC'
  if (slug === 'emprestimos') return 'EMP-001'
  return 'BBAS3'
}

function placeholderForName(slug: string): string {
  if (slug === 'imoveis') return 'Apartamento 302, Centro'
  if (slug === 'cripto') return 'Bitcoin'
  if (slug === 'emprestimos') return 'Empréstimo pessoal'
  return 'Banco do Brasil'
}
