import { normalizar } from '../import/normalize'
import { parseCsv } from '../import/parse-csv'
import { detectNumberFormat, parseNumber } from '../import/parse-number'
import type { SnapshotItem } from './types'

export interface SnapshotFile {
  /** Nome do arquivo. É de onde o ano é lido. */
  nome: string
  csv: string
}

export interface ReadResult {
  items: SnapshotItem[]
  /** Ano lido do nome do arquivo. Zero quando não deu para saber. */
  year: number
  /** Por que este arquivo não serve. */
  erro?: string
}

/**
 * Lê uma aba de posição do relatório consolidado da B3, já em CSV.
 *
 * O relatório vem em abas — Ações, Fundos, BDR — e cada uma vira um arquivo na
 * exportação. Todas têm as mesmas colunas que importam, e a única diferença que
 * pesa é que a aba de BDR não traz CNPJ.
 *
 * Este arquivo NÃO serve para importar negócios, e é bom repetir: ele é uma
 * foto de 31/12, sem data de compra e sem preço pago. Serve para comparar com a
 * foto do ano anterior e descobrir o que mudou. Ver `diff-years.ts`.
 */
export function readSnapshot(arquivo: SnapshotFile): ReadResult {
  const year = anoDoNome(arquivo.nome)
  const tabela = parseCsv(arquivo.csv)
  const formato = detectNumberFormat(tabela.rows.flat())

  const coluna = (...nomes: string[]) => {
    const alvo = nomes.map(normalizar)
    return tabela.headers.findIndex((h) => alvo.some((a) => normalizar(h).startsWith(a)))
  }

  const iSymbol = coluna('codigo de negociacao', 'codigo')
  const iQuantity = coluna('quantidade')
  const iPrice = coluna('preco de fechamento')
  const iName = coluna('produto')
  const iIssuer = coluna('cnpj')

  if (iSymbol < 0 || iQuantity < 0) {
    return {
      items: [],
      year,
      erro:
        'Este arquivo não parece uma aba de posição do relatório consolidado — ' +
        'faltam as colunas de código e quantidade.',
    }
  }

  if (year === 0) {
    return {
      items: [],
      year,
      erro: 'Não consegui ler o ano no nome do arquivo. Renomeie incluindo o ano, como "2023".',
    }
  }

  // "Posição - Fundos" e "Posição - Ações" mudam o rótulo da coluna de CNPJ e
  // pouco mais. A natureza vem do cabeçalho, que é o que o arquivo garante.
  const ehFundo = tabela.headers.some((h) => normalizar(h).includes('cnpj do fundo'))

  const items: SnapshotItem[] = []

  for (const linha of tabela.rows) {
    const symbol = (linha[iSymbol] ?? '').trim().toUpperCase()
    const quantity = parseNumber(linha[iQuantity] ?? '', formato)

    // Linha de total e linha em branco aparecem no fim de toda aba exportada.
    if (!symbol || !quantity || Number(quantity) <= 0) continue

    items.push({
      symbol,
      name: nomeDoProduto(iName >= 0 ? (linha[iName] ?? '') : symbol),
      issuer: iIssuer >= 0 ? (linha[iIssuer] ?? '').replace(/\D/g, '') : '',
      quantity,
      // Preço de fechamento pode faltar em ativo sem negociação no dia. Zero
      // aqui não vira custo zero: vira campo vazio na tela, para o usuário
      // preencher.
      closingPrice: (iPrice >= 0 ? parseNumber(linha[iPrice] ?? '', formato) : null) ?? '0',
      kind: ehFundo ? 'FUNDO' : 'ACAO',
    })
  }

  return { items, year }
}

/**
 * Junta as abas de um mesmo ano num retrato só.
 *
 * Ações e fundos vêm em arquivos separados e descrevem a mesma data. Compará-los
 * em separado faria todo FII parecer que entrou e saiu da carteira a cada ano.
 */
export function agruparPorAno(resultados: readonly ReadResult[]): Map<number, SnapshotItem[]> {
  const porAno = new Map<number, SnapshotItem[]>()

  for (const r of resultados) {
    if (r.erro || r.year === 0) continue
    porAno.set(r.year, [...(porAno.get(r.year) ?? []), ...r.items])
  }

  return porAno
}

/**
 * Ano do nome do arquivo.
 *
 * `relatorio-consolidado-anual-2023.csv` → 2023. Aceita de 1990 a 2100 para não
 * confundir com o número da conta ou o CNPJ, que também aparecem em nome de
 * arquivo exportado.
 */
function anoDoNome(nome: string): number {
  const anos = [...nome.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]))
  const valido = anos.filter((a) => a >= 1990 && a <= 2100)

  // O ÚLTIMO, não o primeiro: "b3-2024-relatorio-2025.csv" é do relatório de
  // 2025, e nome de arquivo baixado costuma acumular carimbos à esquerda.
  return valido[valido.length - 1] ?? 0
}

/** `ALUP11 - ALUPAR INVESTIMENTO S/A` → `ALUPAR INVESTIMENTO S/A`. */
function nomeDoProduto(produto: string): string {
  const partes = produto.split(' - ')
  return (partes.length > 1 ? partes.slice(1).join(' - ') : produto).trim()
}
