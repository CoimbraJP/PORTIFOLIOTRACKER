'use client'

import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import type { ClassWorkspaceView } from '@/core/view/class-workspace-view'
import { parseDecimalInput } from '@/core/money/parse'
import { isKnownTicker } from '@/server/actions/catalog'
import type { TickerSuggestion } from '@/server/actions/catalog'
import type { NewPositionInput } from '@/server/validation/position'
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
   * Código digitado que não está no catálogo e ainda não foi confirmado.
   *
   * Guarda o texto, não um booleano: assim, mudar o código depois de confirmar
   * derruba a confirmação em vez de deixá-la valendo para outro ticker.
   */
  const [unknownConfirmed, setUnknownConfirmed] = useState<string | null>(null)
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
    setUnknownConfirmed(null)
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

    // Código fora do catálogo exige confirmação explícita.
    //
    // Não bloqueia: ativo obscuro que a lista não cobre precisa ser
    // cadastrável. Mas um dígito a mais em "KLBN4" criaria um ativo que nunca
    // terá cotação, e o usuário só descobriria semanas depois — tarde demais
    // para lembrar o que quis digitar.
    const codigo = symbol.trim().toUpperCase()

    if (unknownConfirmed !== codigo) {
      setChecking(true)
      const conhecido = await isKnownTicker(workspace.slug, codigo).finally(() =>
        setChecking(false),
      )

      if (!conhecido) {
        setErrors({
          symbol: `"${codigo}" não está no catálogo. Confira o código e envie de novo para cadastrar assim mesmo.`,
        })
        setUnknownConfirmed(codigo)
        return
      }
    }

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={labels.addAction}
      description={`Em ${workspace.name}. O cálculo acontece no servidor.`}
    >
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
                  setUnknownConfirmed(null)
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
                  setUnknownConfirmed(null)
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
                placeholder="0,00"
              />
            </Field>
          ) : null}

          <Field label={`${labels.unitCost} (${prefixo})`} error={errors.unitCost}>
            <Input
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0,00"
            />
          </Field>

          <Field label={`${labels.unitValue} (${prefixo})`} hint="Vazio = usa o custo">
            <Input
              inputMode="decimal"
              value={unitValue}
              onChange={(e) => setUnitValue(e.target.value)}
              placeholder="0,00"
            />
          </Field>
        </div>

        {/* Mostra o que vai ser gravado antes de gravar. Conversão silenciosa
            é como o usuário descobre um custo errado só meses depois. */}
        {emDolar ? (
          <p className="text-[0.8125rem] text-fg-muted">
            Custo total:{' '}
            <strong className="font-medium tabular-nums text-fg">
              {previewCustoBrl(quantity, unitCost, entryRate, isQuantitative)}
            </strong>
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending || checking}>
            {pending ? 'Calculando…' : checking ? 'Conferindo…' : 'Adicionar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Prévia do custo em reais.
 *
 * Só uma prévia: quem calcula de verdade é o servidor, com `Decimal`. Aqui
 * `Number` basta porque o resultado não é gravado em lugar nenhum — mas o
 * usuário precisa VER o número antes de confirmar.
 */
function previewCustoBrl(
  quantity: string,
  unitCost: string,
  rate: string,
  isQuantitative: boolean,
): string {
  // O MESMO parser do servidor. Prévia que interpreta diferente do que grava
  // é pior do que prévia nenhuma: confirma um número que não será gravado.
  const paraNumero = (v: string) => Number(parseDecimalInput(v))

  const qtd = isQuantitative ? paraNumero(quantity) : 1
  const custo = paraNumero(unitCost)
  const taxa = paraNumero(rate)

  if (![qtd, custo, taxa].every((n) => Number.isFinite(n) && n > 0)) return '—'

  return (qtd * custo * taxa).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
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
