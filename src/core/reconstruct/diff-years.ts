import { divide, money, type Money } from '../money/decimal'
import type { Movement, SnapshotItem, YearSnapshot } from './types'

/**
 * Compara fotos anuais e propõe o que aconteceu entre elas.
 *
 * A leitura ingênua — o que aumentou virou compra, o que sumiu virou venda —
 * está errada com frequência alta o bastante para ser inútil. Numa carteira
 * real de seis anos, ela inventou dez negócios que nunca existiram: Itaúsa e
 * Alupar bonificam todo ano, VVAR3 virou VIIA3 e depois BHIA3 num grupamento
 * de 1:25, Sinqia foi incorporada pela Evertec.
 *
 * Cada um desses, lido como compra ou venda, destrói o custo de aquisição e
 * cria lucro realizado do nada. Por isso o motor procura os PARES antes de
 * cair na leitura simples, e marca o que é palpite.
 */
export function diffYears(snapshots: readonly YearSnapshot[]): Movement[] {
  const anos = [...snapshots].sort((a, b) => a.year - b.year)
  const movimentos: Movement[] = []

  let anterior: Map<string, SnapshotItem> = new Map()

  for (const foto of anos) {
    const atual = indexar(foto.items)
    movimentos.push(...compararAno(foto.year, anterior, atual))
    anterior = atual
  }

  return movimentos
}

function indexar(items: readonly SnapshotItem[]): Map<string, SnapshotItem> {
  return new Map(items.map((i) => [i.symbol, i]))
}

function compararAno(
  year: number,
  anterior: Map<string, SnapshotItem>,
  atual: Map<string, SnapshotItem>,
): Movement[] {
  const movimentos: Movement[] = []

  const entraram = [...atual.values()].filter((i) => !anterior.has(i.symbol))
  const sairam = [...anterior.values()].filter((i) => !atual.has(i.symbol))
  const usados = new Set<string>()

  // A ordem destas passagens é a regra central deste arquivo: EVIDÊNCIA EXATA
  // antes de palpite. O CNPJ prova quem é quem; a quantidade só sugere. Rodar o
  // palpite primeiro fazia AESB1 — recibo de subscrição da AES Brasil — casar
  // com EVTC31 porque os dois tinham 5 unidades, e o recibo virava uma venda.

  // --- 1. mesmo CNPJ, um sai e outro entra ---------------------------------
  for (const saiu of sairam) {
    const par = parPorEmissor(saiu, entraram, usados)
    if (!par) continue

    usados.add(par.entrou.symbol)
    usados.add(saiu.symbol)
    movimentos.push(par.movimento(year))
  }

  // --- 2. o ticker some, mas o EMISSOR continua sob outro código -----------
  //
  // AESB1 é o recibo de subscrição da AES Brasil: ele desaparece virando AESB3,
  // que já estava na carteira. Nada "entrou" — por isso o pareamento acima não
  // encontra —, e lido como venda o recibo viraria lucro realizado.
  //
  // Vale nos dois sentidos: KLBN3 e KLBN4 aparecem em 2025 com o CNPJ da
  // KLBN11, que continua lá. É o desmembramento da unit, não compra.
  for (const saiu of sairam) {
    if (usados.has(saiu.symbol) || !saiu.issuer) continue

    const destino = [...atual.values()].find(
      (i) => i.issuer === saiu.issuer && i.symbol !== saiu.symbol,
    )
    if (!destino) continue

    usados.add(saiu.symbol)
    movimentos.push({
      year,
      kind: 'RENOMEACAO',
      symbol: destino.symbol,
      fromSymbol: saiu.symbol,
      name: destino.name,
      quantity: saiu.quantity,
      referencePrice: destino.closingPrice,
      motivo:
        `${saiu.symbol} sumiu e ${destino.symbol}, do mesmo CNPJ, continua na ` +
        'carteira — o papel virou o outro, não foi vendido',
      confirmar: false,
    })
  }

  // --- 3. o ticker nasce do CNPJ de outro que continua na carteira ---------
  for (const item of entraram) {
    if (usados.has(item.symbol) || !item.issuer) continue

    const origem = [...anterior.values()].find(
      (i) => i.issuer === item.issuer && i.symbol !== item.symbol && atual.has(i.symbol),
    )
    if (!origem) continue

    usados.add(item.symbol)
    movimentos.push({
      year,
      kind: 'BONIFICACAO',
      symbol: item.symbol,
      fromSymbol: origem.symbol,
      name: item.name,
      quantity: item.quantity,
      referencePrice: item.closingPrice,
      motivo:
        `${item.symbol} apareceu com o CNPJ de ${origem.symbol}, que continua na ` +
        'carteira — parece desmembramento ou bonificação em outra classe, não compra',
      confirmar: true,
    })
  }

  // --- 4. só agora o palpite: mesma quantidade ou razão redonda ------------
  for (const saiu of sairam) {
    if (usados.has(saiu.symbol)) continue

    const par = parPorQuantidade(saiu, entraram, usados)
    if (!par) continue

    usados.add(par.entrou.symbol)
    usados.add(saiu.symbol)
    movimentos.push(par.movimento(year))
  }

  for (const item of entraram) {
    if (usados.has(item.symbol)) continue

    movimentos.push({
      year,
      kind: 'ENTRADA',
      symbol: item.symbol,
      name: item.name,
      quantity: item.quantity,
      referencePrice: item.closingPrice,
      motivo: `${item.symbol} aparece pela primeira vez no relatório de ${year}`,
      confirmar: false,
    })
  }

  for (const item of sairam) {
    if (usados.has(item.symbol)) continue

    movimentos.push({
      year,
      kind: 'SAIDA',
      symbol: item.symbol,
      name: item.name,
      quantity: item.quantity,
      referencePrice: item.closingPrice,
      motivo: `${item.symbol} não aparece mais no relatório de ${year}`,
      confirmar: false,
    })
  }

  // --- mesmo ticker, quantidade diferente ------------------------------------
  for (const item of atual.values()) {
    const antes = anterior.get(item.symbol)
    if (!antes) continue

    const de = money(antes.quantity)
    const para = money(item.quantity)
    if (de.equals(para)) continue

    movimentos.push(mudancaDeQuantidade(year, item, de, para, money(antes.closingPrice)))
  }

  return movimentos
}

/**
 * Lê um aumento ou redução de quantidade no mesmo ticker.
 *
 * A ordem das perguntas importa: fator redondo de desdobramento vem antes de
 * "aumento pequeno é bonificação", senão um desdobramento 1:2 viraria uma
 * compra do mesmo tamanho da posição.
 *
 * Mas fator redondo sozinho não basta — uma carteira real provou isso. Quem
 * tinha 100 ações e comprou mais 200 no ano termina com 300, um "1:3" tão
 * redondo quanto um desdobramento de verdade, e nada aqui distinguia os dois:
 * toda compra que por coincidência triplicasse, quintuplicasse ou dobrasse a
 * posição virava desdobramento, zerava o preço e destruía o custo médio. É
 * por isso que `confirmaPeloPreco` entra: um desdobramento MEXE no preço, na
 * mesma proporção e no sentido oposto; uma compra não mexe. Preço confirma
 * quantidade, não só o inverso.
 */
function mudancaDeQuantidade(
  year: number,
  item: SnapshotItem,
  de: Money,
  para: Money,
  precoAnterior: Money,
): Movement {
  const fator = divide(para, de)
  const base = {
    year,
    symbol: item.symbol,
    name: item.name,
    referencePrice: item.closingPrice,
  }

  const redondo = fatorRedondo(fator)
  if (redondo && confirmaPeloPreco(precoAnterior, money(item.closingPrice), fator)) {
    const cresceu = para.greaterThan(de)
    return {
      ...base,
      kind: cresceu ? 'DESDOBRAMENTO' : 'GRUPAMENTO',
      quantity: para.minus(de).abs().toString(),
      ratio: fator.toString(),
      motivo:
        `${item.symbol} passou de ${de} para ${para} — fator ${redondo}, ` +
        `que é ${cresceu ? 'desdobramento' : 'grupamento'} e não ${cresceu ? 'compra' : 'venda'}`,
      confirmar: true,
    }
  }

  // Crescimento pequeno e quebrado é a cara de bonificação: a empresa entrega
  // ações novas em proporção, e sobra fração. Itaúsa faz 5% ou 10% ao ano;
  // Alupar, 4%. Quem compra escolhe um número redondo de ações.
  const cresceu = para.greaterThan(de)
  const percentual = fator.minus(1).times(100)

  if (cresceu && percentual.lessThanOrEqualTo(15)) {
    // O teste é só a proporção. Já tentei exigir que sobrasse fração — bonifica
    // ção costuma deixar quebrado — e o filtro perdeu o caso mais comum de
    // todos: 5% de 1000 são 50 ações redondas. Errar para o lado de perguntar
    // demais é barato; o outro lado infla o custo em silêncio.
    return {
      ...base,
      kind: 'BONIFICACAO',
      quantity: para.minus(de).toString(),
      motivo:
        `${item.symbol} cresceu ${percentual.toFixed(2)}% — parece bonificação, ` +
        'que aumenta a quantidade sem custo. Se foi compra, troque aqui',
      confirmar: true,
    }
  }

  return {
    ...base,
    kind: cresceu ? 'AUMENTO' : 'REDUCAO',
    quantity: para.minus(de).abs().toString(),
    motivo: `${item.symbol} passou de ${de} para ${para} durante ${year}`,
    confirmar: false,
  }
}

type Par = { entrou: SnapshotItem; movimento: (year: number) => Movement }

/**
 * Par pelo CNPJ. Não é palpite, é fato.
 *
 * O emissor não muda quando o ticker muda. Este caminho não pede confirmação
 * porque não há o que confirmar: VVAR3 e VIIA3 são literalmente a mesma empresa
 * no mesmo relatório.
 */
function parPorEmissor(
  saiu: SnapshotItem,
  entraram: readonly SnapshotItem[],
  usados: ReadonlySet<string>,
): Par | null {
  const disponiveis = entraram.filter((e) => !usados.has(e.symbol))

  const mesmoEmissor = saiu.issuer
    ? disponiveis.find((e) => e.issuer === saiu.issuer)
    : undefined

  if (mesmoEmissor) {
    const razao = divide(money(mesmoEmissor.quantity), money(saiu.quantity))
    const trocouQuantidade = !razao.equals(money(1))

    return {
      entrou: mesmoEmissor,
      movimento: (year) => ({
        year,
        kind: trocouQuantidade ? 'INCORPORACAO' : 'RENOMEACAO',
        symbol: mesmoEmissor.symbol,
        fromSymbol: saiu.symbol,
        name: mesmoEmissor.name,
        quantity: mesmoEmissor.quantity,
        referencePrice: mesmoEmissor.closingPrice,
        ...(trocouQuantidade ? { ratio: razao.toString() } : {}),
        motivo:
          `${saiu.symbol} virou ${mesmoEmissor.symbol} — mesmo CNPJ no relatório` +
          (trocouQuantidade
            ? `, e ${saiu.quantity} viraram ${mesmoEmissor.quantity}`
            : ', mesma quantidade'),
        confirmar: false,
      }),
    }
  }

  return null
}

/**
 * Par pela quantidade. É palpite, e vem marcado como tal.
 *
 * Só roda depois de todas as evidências exatas. Trocar de nome não muda quantas
 * ações a pessoa tem, então quantidade igual sugere continuidade — mas sugere
 * apenas: numa carteira real, VIIA3 saiu com 1000 no mesmo ano em que WIZC3
 * entrou com 1000, e são empresas sem nenhuma relação.
 */
function parPorQuantidade(
  saiu: SnapshotItem,
  entraram: readonly SnapshotItem[],
  usados: ReadonlySet<string>,
): Par | null {
  const disponiveis = entraram.filter((e) => !usados.has(e.symbol))

  // Emissor conhecido e diferente ELIMINA o candidato. Sem esta linha, o
  // palpite voltaria a parear empresas sem relação.
  const semEmissorConhecido = disponiveis.filter(
    (e) => !saiu.issuer || !e.issuer || e.issuer === saiu.issuer,
  )

  const mesmaQuantidade = semEmissorConhecido.find((e) =>
    money(e.quantity).equals(money(saiu.quantity)),
  )

  if (mesmaQuantidade) {
    return {
      entrou: mesmaQuantidade,
      movimento: (year) => ({
        year,
        kind: 'RENOMEACAO',
        symbol: mesmaQuantidade.symbol,
        fromSymbol: saiu.symbol,
        name: mesmaQuantidade.name,
        quantity: mesmaQuantidade.quantity,
        referencePrice: mesmaQuantidade.closingPrice,
        motivo:
          `${saiu.symbol} sumiu e ${mesmaQuantidade.symbol} apareceu com a mesma ` +
          `quantidade (${saiu.quantity}) — parece troca de código, não venda e compra`,
        confirmar: true,
      }),
    }
  }

  for (const entrou of semEmissorConhecido) {
    const razao = divide(money(entrou.quantity), money(saiu.quantity))
    const redondo = fatorRedondo(razao)
    if (!redondo) continue

    return {
      entrou,
      movimento: (year) => ({
        year,
        kind: 'INCORPORACAO',
        symbol: entrou.symbol,
        fromSymbol: saiu.symbol,
        name: entrou.name,
        quantity: entrou.quantity,
        referencePrice: entrou.closingPrice,
        ratio: razao.toString(),
        motivo:
          `${saiu.quantity} de ${saiu.symbol} viraram ${entrou.quantity} de ` +
          `${entrou.symbol} — razão ${redondo}, que é troca de ações e não negócio`,
        confirmar: true,
      }),
    }
  }

  return null
}

/**
 * Confere se o PREÇO bate com o desdobramento, não só a quantidade.
 *
 * Um desdobramento de verdade nasce dividindo o preço pelo mesmo fator que
 * multiplica a quantidade — é assim que a B3 registra o evento no dia em que
 * ele acontece. Uma compra comum não faz o preço do papel cair: quem comprou
 * mais PETR4 não fez a PETR4 ficar mais barata.
 *
 * A tolerância é larga (60%) de propósito: o preço que temos é o de 31/12,
 * meses depois do evento, e o mercado se move nesse intervalo — um
 * desdobramento real raramente bate o fator com exatidão. Mas o erro que este
 * teste existe para pegar não é uma variação de mercado, é um fator errado
 * por uma ORDEM DE GRANDEZA inteira (3x, 5x, 10x) — e esse erro nenhuma
 * variação normal de preço em um ano imita por acidente.
 *
 * Sem preço num dos dois lados (raro — papel suspenso, por exemplo), não há
 * como confirmar nem desmentir: o fator redondo continua valendo sozinho, e a
 * linha já nasce marcada para conferência humana.
 */
function confirmaPeloPreco(precoAntes: Money, precoDepois: Money, fator: Money): boolean {
  if (precoAntes.lessThanOrEqualTo(0) || precoDepois.lessThanOrEqualTo(0)) return true

  const esperado = divide(precoAntes, fator)
  const desvio = precoDepois.minus(esperado).abs().dividedBy(esperado)

  return desvio.lessThanOrEqualTo(money('0.6'))
}

/**
 * Diz se o fator é dos que uma assembleia aprova.
 *
 * Desdobramento e grupamento saem em números que uma pessoa escreveu num
 * documento: 1:2, 1:10, 25:1. Divisão de quantidades reais quase nunca cai
 * nesses valores por acaso, e é isso que torna o teste útil.
 */
function fatorRedondo(fator: Money): string | null {
  const conhecidos: [string, string][] = [
    ['2', '1:2'],
    ['3', '1:3'],
    ['4', '1:4'],
    ['5', '1:5'],
    ['10', '1:10'],
    ['100', '1:100'],
    ['0.5', '2:1'],
    ['0.2', '5:1'],
    ['0.1', '10:1'],
    ['0.04', '25:1'],
    ['0.02', '50:1'],
    ['0.01', '100:1'],
  ]

  for (const [valor, rotulo] of conhecidos) {
    if (fator.minus(money(valor)).abs().lessThan(money('0.0001'))) return rotulo
  }

  return null
}
