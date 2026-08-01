import { normalizar } from './normalize'
import { detectNumberFormat, parseDigitado, parseNumber, type NumberFormat } from './parse-number'

/** Os campos que um lançamento importado precisa ter. */
export type ImportField =
  | 'date'
  | 'classSlug'
  | 'wallet'
  | 'symbol'
  | 'name'
  | 'side'
  | 'quantity'
  | 'unitPrice'
  | 'currency'
  | 'rate'
  | 'fees'

export type ColumnMap = Partial<Record<ImportField, number>>

/**
 * Traduz o que a planilha escreveu na coluna Classe para o slug do sistema.
 *
 * Recebida de fora porque a lista de classes é configuração, e `core/` não lê
 * configuração de tela nem banco. Devolve nulo quando não reconhece — e aí a
 * linha para, em vez de cair numa classe padrão que colocaria um CDB junto das
 * ações.
 */
export type ClassLookup = (valor: string) => string | null

export interface ImportedRow {
  linha: number
  date: string
  /**
   * Hora do negócio, quando a planilha traz. Não vira dado do lançamento — o
   * ledger trabalha por dia — mas entra na chave de idempotência, porque é ela
   * que distingue dois negócios iguais feitos no mesmo dia.
   */
  time: string
  /** Slug da classe. Sem ele não há onde colocar o ativo. */
  classSlug: string
  /** Nome da carteira. Criada se ainda não existir. */
  wallet: string
  symbol: string
  name: string
  side: 'BUY' | 'SELL'
  quantity: string
  unitPrice: string
  /** Moeda em que o preço foi digitado. */
  currency: 'BRL' | 'USD'
  /** Câmbio da data. Obrigatório quando a moeda é USD. */
  rate: string
  fees: string
  /**
   * Quantas linhas idênticas a esta vieram antes no arquivo.
   *
   * Comprar duas vezes a mesma quantidade pelo mesmo preço no mesmo dia é
   * comum em cripto, e são dois negócios. Sem este contador as duas linhas
   * teriam a mesma chave e a segunda seria descartada como duplicata.
   */
  ocorrencia: number
  /**
   * O que o usuário corrigiu à mão nesta linha, e o que estava escrito antes.
   *
   * Guardado para virar anotação no lançamento: daqui a um ano, "por que este
   * preço não bate com o extrato?" precisa ter resposta.
   */
  corrigido?: { campo: 'unitPrice' | 'quantity'; de: string }[]
  /** Por que esta linha não pode entrar. Vazio quando está boa. */
  erro?: string
  /**
   * A linha é válida, mas destoa do resto do arquivo a ponto de merecer
   * conferência. Não impede a importação; aparece marcada na tela.
   */
  aviso?: string
}

/**
 * O que vale para o arquivo inteiro quando a planilha não tem a coluna.
 *
 * Export de corretora quase nunca traz classe nem carteira: o arquivo INTEIRO
 * é de uma carteira só, e o nome dela está no título, não nas linhas. Perguntar
 * uma vez é honesto; exigir a coluna seria obrigar o usuário a editar o arquivo
 * antes de subir.
 */
export interface ImportDefaults {
  classSlug?: string
  wallet?: string
  currency?: 'BRL' | 'USD'
  /** Câmbio por data, quando conhecido. Chave `YYYY-MM-DD`. */
  rates?: Record<string, string>
  /**
   * Valores que o usuário corrigiu na conferência, por número de linha da
   * planilha.
   *
   * Existe porque exportador erra e o arquivo não é editável por quem importa.
   * A correção substitui a célula ANTES de qualquer validação — ela passa pelas
   * mesmas regras de número, de sinal e de ordem de grandeza que o resto. Não é
   * um atalho para furar a checagem; é trocar o que estava escrito.
   */
  correcoes?: Record<number, { unitPrice?: string; quantity?: string }>
}


/**
 * Compra ou venda, a partir do que a planilha escreveu.
 *
 * O extrato da B3 usa "Compra"/"Venda"; nota de corretagem usa "C"/"V"; quem
 * exporta de fora escreve "buy"/"sell". Na dúvida devolve nulo em vez de
 * chutar: registrar uma venda como compra inverte o preço médio e o erro só
 * aparece meses depois, na hora de calcular lucro.
 */
function lado(valor: string): 'BUY' | 'SELL' | null {
  const texto = normalizar(valor)

  if (texto.startsWith('c') || texto.includes('buy') || texto.includes('debito')) return 'BUY'
  if (texto.startsWith('v') || texto.includes('sell') || texto.includes('credito')) return 'SELL'
  return null
}

/**
 * Data em `YYYY-MM-DD` e hora, quando houver.
 *
 * Aceita `dd/mm/aaaa`, que é o que sai de qualquer planilha brasileira, e o
 * formato ISO com ou sem hora. Rejeita o resto: `03/04/2025` é ambíguo entre
 * padrões, e escolher errado desloca todo o histórico em meses.
 */
function data(valor: string): { date: string; time: string } | null {
  const texto = valor.trim()
  const hora = /(\d{2}:\d{2}(:\d{2})?)/.exec(texto)?.[1] ?? ''

  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto)
  if (br) return { date: `${br[3]}-${br[2]}-${br[1]}`, time: hora }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time: hora }

  return null
}

/**
 * Converte as linhas cruas em lançamentos, marcando o que está errado.
 *
 * Nenhuma linha é descartada em silêncio. Linha ruim volta com o motivo escrito
 * e aparece na pré-visualização — importar 47 de 50 sem dizer quais três
 * ficaram de fora é a forma mais fácil de perder um aporte sem perceber.
 */
export function mapRows(
  rows: string[][],
  mapa: ColumnMap,
  classes: ClassLookup,
  defaults: ImportDefaults = {},
  formato: NumberFormat = detectNumberFormat(rows.flat()),
): ImportedRow[] {
  const pegar = (linha: string[], campo: ImportField) => {
    const indice = mapa[campo]
    return indice === undefined ? '' : (linha[indice] ?? '')
  }

  const vistas = new Map<string, number>()

  const convertidas = rows.map((linha, index) => {
    const base: ImportedRow = {
      linha: index + 2, // +2: a planilha conta o cabeçalho e começa em 1.
      date: '',
      time: '',
      classSlug: '',
      wallet: '',
      symbol: '',
      name: '',
      side: 'BUY',
      quantity: '',
      unitPrice: '',
      currency: defaults.currency ?? 'BRL',
      rate: '1',
      fees: '0',
      ocorrencia: 0,
    }

    const falha = (erro: string) => ({ ...base, erro })

    const quando = data(pegar(linha, 'date'))
    if (!quando) return falha(`Data inválida: "${pegar(linha, 'date')}"`)
    base.date = quando.date
    base.time = quando.time

    // A coluna vence o padrão: se a planilha diz a classe, é ela que vale.
    const classeBruta = pegar(linha, 'classSlug').trim()
    base.classSlug = (classeBruta ? classes(classeBruta) : null) ?? defaults.classSlug ?? ''
    if (!base.classSlug) return falha(`Classe desconhecida: "${classeBruta}"`)

    base.wallet = pegar(linha, 'wallet').trim() || (defaults.wallet ?? '')
    if (!base.wallet) return falha('Sem carteira: informe onde o ativo fica guardado')

    base.symbol = pegar(linha, 'symbol').toUpperCase().replace(/\s+/g, '')
    if (!base.symbol) return falha('Sem código do ativo')

    base.name = pegar(linha, 'name').trim()

    const side = mapa.side === undefined ? 'BUY' : lado(pegar(linha, 'side'))
    if (!side) return falha(`Não sei se é compra ou venda: "${pegar(linha, 'side')}"`)
    base.side = side

    // A correção do usuário substitui a célula ANTES de validar: ela passa
    // pelas mesmas regras que o valor original, inclusive o aviso de ordem de
    // grandeza. Corrigir não é furar a checagem, é trocar o que estava escrito.
    const correcao = defaults.correcoes?.[base.linha]
    const corrigido: NonNullable<ImportedRow['corrigido']> = []

    const celula = (campo: 'unitPrice' | 'quantity') => {
      const original = pegar(linha, campo)
      const novo = correcao?.[campo]?.trim()
      if (!novo) return parseNumber(original, formato)

      const convertido = parseDigitado(novo)
      if (convertido === null) return null

      corrigido.push({ campo, de: original })
      return convertido
    }

    const quantity = celula('quantity')
    if (!quantity || Number(quantity) <= 0) {
      return falha(`Quantidade inválida: "${correcao?.quantity ?? pegar(linha, 'quantity')}"`)
    }

    // Preço ZERO é aceito de propósito. Airdrop, bonificação e desdobramento
    // entram sem custo, e recusá-los faria a quantidade sumir da carteira —
    // o ativo existe, foi só de graça.
    const unitPrice = celula('unitPrice')
    if (unitPrice === null || Number(unitPrice) < 0) {
      return falha(`Preço inválido: "${correcao?.unitPrice ?? pegar(linha, 'unitPrice')}"`)
    }

    base.quantity = quantity
    base.unitPrice = unitPrice
    if (corrigido.length > 0) base.corrigido = corrigido
    // Taxa ausente vem como "--" em vários exportadores. Ausente é zero.
    base.fees = parseNumber(pegar(linha, 'fees'), formato) ?? '0'

    const moedaBruta = normalizar(pegar(linha, 'currency'))
    if (moedaBruta) {
      base.currency = moedaBruta.includes('usd') || moedaBruta.includes('dolar') ? 'USD' : 'BRL'
    }

    if (base.currency === 'USD') {
      // Câmbio da coluna, senão o da data buscado por quem chamou. Sem os dois
      // a linha para: chutar o câmbio corromperia o custo de forma permanente
      // e invisível — o mesmo erro que já custou caro no formulário.
      const taxa = parseNumber(pegar(linha, 'rate'), formato) ?? defaults.rates?.[base.date] ?? null
      if (!taxa || Number(taxa) <= 0) {
        return falha(`Preço em dólar sem câmbio de ${base.date}`)
      }
      base.rate = taxa
    }

    const assinatura = `${base.date}:${base.time}:${base.symbol}:${base.side}:${base.quantity}:${base.unitPrice}`
    base.ocorrencia = vistas.get(assinatura) ?? 0
    vistas.set(assinatura, base.ocorrencia + 1)

    return base
  })

  return sinalizarAbsurdos(convertidas)
}

/**
 * Marca as linhas cujo valor destoa do resto do arquivo.
 *
 * Existe porque exportador erra: uma linha com o preço em outra denominação
 * passa em toda validação — é um número válido — e sozinha multiplica o
 * patrimônio por milhões. Nenhuma regra de formato pega isso; só a comparação
 * com as outras linhas do mesmo arquivo pega.
 *
 * Sinaliza, não bloqueia. Quem sabe se aquele aporte foi realmente grande é o
 * dono do dinheiro.
 */
function sinalizarAbsurdos(rows: ImportedRow[]): ImportedRow[] {
  // `Number` aqui ORDENA, não contabiliza: nenhum destes valores vira dinheiro
  // guardado. O que for gravado passa por Decimal, como sempre.
  const totais = rows
    .filter((r) => !r.erro)
    .map((r) => Number(r.quantity) * Number(r.unitPrice))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)

  if (totais.length < 4) return rows

  const mediana = totais[Math.floor(totais.length / 2)]!
  const teto = mediana * 1000

  return rows.map((r) => {
    if (r.erro) return r
    const total = Number(r.quantity) * Number(r.unitPrice)
    if (total <= teto) return r

    return { ...r, aviso: 'Valor muito acima do resto do arquivo — confira o preço unitário' }
  })
}

/**
 * Chave de idempotência de uma linha importada.
 *
 * Reimportar o mesmo arquivo não pode duplicar nada — e reimportar é o caso
 * NORMAL: a pessoa baixa o extrato de novo no mês seguinte, com os negócios
 * antigos junto.
 *
 * Inclui hora e número de ocorrência porque negócios genuinamente idênticos no
 * mesmo dia existem. Sem eles, o segundo seria confundido com uma repetição do
 * primeiro e sumiria — perder um aporte é pior que duplicar um, porque
 * duplicata a pessoa vê.
 *
 * Não inclui taxa: se a corretora corrigir a corretagem de um negócio, é o
 * MESMO negócio, e ele deve ser atualizado em vez de duplicado.
 */
export function importKey(row: ImportedRow): string {
  const quando = row.time ? `${row.date}T${row.time}` : row.date

  return `csv:${quando}:${row.wallet}:${row.symbol}:${row.side}:${row.quantity}:${row.unitPrice}:${row.ocorrencia}`
}
