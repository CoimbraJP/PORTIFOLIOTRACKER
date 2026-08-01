import type { AssetClassSlug, InstrumentKind, ValuationMode } from '@/core/types/portfolio'

/** Tipos de campo que o formulário dinâmico sabe renderizar. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'select'
  | 'files'

export interface FieldDefinition {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  hint?: string
}

export interface Term {
  one: string
  many: string
}

export interface AssetClassDefinition {
  slug: AssetClassSlug
  name: string
  /**
   * Como o nível do meio se chama nesta classe.
   * O modelo é sempre `wallet`; só o rótulo muda. Chamar "Campinas" de carteira
   * de imóveis seria correto no banco e errado na tela.
   */
  walletTerm: Term
  /** Como o ativo se chama nesta classe: ativo, imóvel, contrato… */
  assetTerm: Term
  /** Como o valor atual é obtido. Ver docs/00 §3.3. */
  valuationMode: ValuationMode
  /**
   * A natureza dos instrumentos desta classe.
   *
   * É o que decide se o ativo vai para uma API de mercado. Mora aqui, na
   * definição da classe, e não espalhado por Server Action e seed: descrever o
   * que uma classe é já era responsabilidade deste arquivo.
   */
  instrumentKind: InstrumentKind
  /**
   * `true` quando o instrumento é privado do tenant.
   *
   * Um apartamento em Pinheiros ou um CDB do Inter não têm ticker público — não
   * faz sentido compartilhá-los entre usuários como se compartilha PETR4.
   */
  privateInstrument: boolean
  /**
   * Se o lançamento pode ser digitado em dólar.
   *
   * Vale para o que é NEGOCIADO em dólar no mundo real — stock, ETF
   * internacional, cripto. Não é o mesmo que a moeda de exibição, que é
   * preferência de leitura e existe para qualquer classe: aqui a pergunta é
   * "em que moeda o dinheiro saiu da sua conta".
   */
  foreignEntry: boolean
  /** Liga o motor de proventos automáticos. Ver docs/01 §5.3. */
  supportsDividends: boolean
  icon: string
  /** Sempre um token. Nenhum hexadecimal fora de tokens.css. */
  colorVar: string
  sortOrder: number
  /** Campos próprios da classe. Criar classe nova é um insert, não um deploy. */
  fields: FieldDefinition[]
}

const NOTES: FieldDefinition = { key: 'notes', label: 'Observações', type: 'textarea' }

export const ASSET_CLASSES: readonly AssetClassDefinition[] = [
  {
    slug: 'acoes-br',
    name: 'Ações Brasil',
    walletTerm: { one: 'Corretora', many: 'Corretoras' },
    assetTerm: { one: 'Ação', many: 'Ações' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'STOCK',
    privateInstrument: false,
    foreignEntry: false,
    supportsDividends: true,
    icon: 'TrendingUp',
    colorVar: 'var(--color-class-acoes-br)',
    sortOrder: 1,
    fields: [{ key: 'sector', label: 'Setor', type: 'text' }, NOTES],
  },
  {
    slug: 'stocks',
    name: 'Stocks',
    walletTerm: { one: 'Corretora', many: 'Corretoras' },
    assetTerm: { one: 'Ação', many: 'Ações' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'STOCK',
    privateInstrument: false,
    foreignEntry: true,
    supportsDividends: true,
    icon: 'Globe',
    colorVar: 'var(--color-class-stocks)',
    sortOrder: 2,
    fields: [{ key: 'sector', label: 'Setor', type: 'text' }, NOTES],
  },
  {
    slug: 'fiis',
    name: 'FIIs',
    walletTerm: { one: 'Corretora', many: 'Corretoras' },
    assetTerm: { one: 'Fundo', many: 'Fundos' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'FII',
    privateInstrument: false,
    foreignEntry: false,
    supportsDividends: true,
    icon: 'Building2',
    colorVar: 'var(--color-class-fiis)',
    sortOrder: 3,
    fields: [
      { key: 'segment', label: 'Segmento', type: 'text' },
      { key: 'manager', label: 'Gestora', type: 'text' },
      NOTES,
    ],
  },
  {
    slug: 'etfs',
    name: 'ETFs',
    walletTerm: { one: 'Corretora', many: 'Corretoras' },
    assetTerm: { one: 'ETF', many: 'ETFs' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'ETF',
    privateInstrument: false,
    foreignEntry: false,
    supportsDividends: true,
    icon: 'Layers',
    colorVar: 'var(--color-class-etfs)',
    sortOrder: 4,
    fields: [{ key: 'index', label: 'Índice de referência', type: 'text' }, NOTES],
  },
  {
    slug: 'etfs-int',
    name: 'ETFs Internacionais',
    walletTerm: { one: 'Corretora', many: 'Corretoras' },
    assetTerm: { one: 'ETF', many: 'ETFs' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'ETF',
    privateInstrument: false,
    foreignEntry: true,
    supportsDividends: true,
    icon: 'Globe2',
    colorVar: 'var(--color-class-etfs-int)',
    sortOrder: 5,
    fields: [
      { key: 'index', label: 'Índice de referência', type: 'text' },
      { key: 'domicile', label: 'Domicílio', type: 'text' },
      NOTES,
    ],
  },
  {
    slug: 'cripto',
    name: 'Criptomoedas',
    walletTerm: { one: 'Carteira', many: 'Carteiras e exchanges' },
    assetTerm: { one: 'Moeda', many: 'Moedas' },
    valuationMode: 'QUANTITATIVE',
    instrumentKind: 'CRYPTO',
    privateInstrument: false,
    foreignEntry: true,
    supportsDividends: false,
    icon: 'Bitcoin',
    colorVar: 'var(--color-class-cripto)',
    sortOrder: 6,
    fields: [
      { key: 'network', label: 'Rede', type: 'text', hint: 'Ethereum, Solana, Base…' },
      { key: 'address', label: 'Endereço público', type: 'text' },
      NOTES,
    ],
  },
  {
    slug: 'renda-fixa',
    name: 'Renda Fixa',
    walletTerm: { one: 'Instituição', many: 'Instituições' },
    assetTerm: { one: 'Título', many: 'Títulos' },
    valuationMode: 'ACCRUAL',
    instrumentKind: 'FIXED_INCOME',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'Landmark',
    colorVar: 'var(--color-class-renda-fixa)',
    sortOrder: 7,
    fields: [
      { key: 'issuer', label: 'Emissor', type: 'text', required: true },
      { key: 'indexer', label: 'Indexador', type: 'select', options: ['CDI', 'IPCA+', 'Prefixado', 'SELIC'] },
      { key: 'rate', label: 'Taxa', type: 'percent', required: true },
      { key: 'maturity', label: 'Vencimento', type: 'date' },
      NOTES,
    ],
  },
  {
    slug: 'imoveis',
    name: 'Imóveis',
    walletTerm: { one: 'Cidade', many: 'Cidades' },
    assetTerm: { one: 'Imóvel', many: 'Imóveis' },
    valuationMode: 'VALUATED',
    instrumentKind: 'CUSTOM',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'Home',
    colorVar: 'var(--color-class-imoveis)',
    sortOrder: 8,
    fields: [
      { key: 'area', label: 'Área (m²)', type: 'number' },
      { key: 'city', label: 'Cidade', type: 'text' },
      { key: 'state', label: 'Estado', type: 'text' },
      { key: 'rent', label: 'Valor do aluguel', type: 'money' },
      { key: 'photos', label: 'Fotos', type: 'files' },
      { key: 'documents', label: 'Documentos', type: 'files' },
      NOTES,
    ],
  },
  {
    slug: 'emprestimos',
    name: 'Empréstimos a juros',
    walletTerm: { one: 'Devedor', many: 'Devedores' },
    assetTerm: { one: 'Contrato', many: 'Contratos' },
    valuationMode: 'ACCRUAL',
    instrumentKind: 'CUSTOM',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'HandCoins',
    colorVar: 'var(--color-class-emprestimos)',
    sortOrder: 9,
    // O usuário é sempre o CREDOR. O lado devedor nunca é modelado — CLAUDE.md §1.
    fields: [
      { key: 'borrower', label: 'Devedor', type: 'text', required: true },
      { key: 'rate', label: 'Taxa de juros (a.m.)', type: 'percent', required: true },
      { key: 'startDate', label: 'Data', type: 'date', required: true },
      { key: 'dueDate', label: 'Vencimento', type: 'date' },
      { key: 'installments', label: 'Parcelas', type: 'number' },
      NOTES,
    ],
  },
  {
    slug: 'alternativos',
    name: 'Investimentos Alternativos',
    walletTerm: { one: 'Coleção', many: 'Coleções' },
    assetTerm: { one: 'Item', many: 'Itens' },
    valuationMode: 'VALUATED',
    instrumentKind: 'CUSTOM',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'Gem',
    colorVar: 'var(--color-class-alternativos)',
    sortOrder: 10,
    fields: [{ key: 'category', label: 'Categoria', type: 'text' }, NOTES],
  },
  {
    slug: 'empresas',
    name: 'Empresas',
    walletTerm: { one: 'Grupo', many: 'Grupos' },
    assetTerm: { one: 'Participação', many: 'Participações' },
    valuationMode: 'VALUATED',
    instrumentKind: 'CUSTOM',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'Briefcase',
    colorVar: 'var(--color-class-empresas)',
    sortOrder: 11,
    fields: [
      { key: 'cnpj', label: 'CNPJ', type: 'text' },
      { key: 'stake', label: 'Participação', type: 'percent' },
      NOTES,
    ],
  },
  {
    slug: 'outros',
    name: 'Outros',
    walletTerm: { one: 'Carteira', many: 'Carteiras' },
    assetTerm: { one: 'Item', many: 'Itens' },
    valuationMode: 'VALUATED',
    instrumentKind: 'CUSTOM',
    privateInstrument: true,
    foreignEntry: false,
    supportsDividends: false,
    icon: 'Box',
    colorVar: 'var(--color-class-outros)',
    sortOrder: 12,
    fields: [NOTES],
  },
] as const

const BY_SLUG = new Map<AssetClassSlug, AssetClassDefinition>(
  ASSET_CLASSES.map((c) => [c.slug, c]),
)

export function assetClass(slug: AssetClassSlug): AssetClassDefinition {
  const found = BY_SLUG.get(slug)
  if (!found) throw new Error(`Classe de ativo desconhecida: ${slug}`)
  return found
}
