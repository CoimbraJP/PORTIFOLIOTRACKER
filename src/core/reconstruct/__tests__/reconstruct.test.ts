import { describe, expect, it } from 'vitest'
import { diffYears } from '../diff-years'
import { readSnapshot } from '../read-snapshot'
import { toProposals, validarProposta } from '../to-proposals'
import type { SnapshotItem, YearSnapshot } from '../types'

function item(symbol: string, quantity: string, issuer = '', preco = '10'): SnapshotItem {
  return { symbol, name: symbol, issuer, quantity, closingPrice: preco, kind: 'ACAO' }
}

function anos(...fotos: [number, SnapshotItem[]][]): YearSnapshot[] {
  return fotos.map(([year, items]) => ({ year, items }))
}

describe('troca de ticker', () => {
  it('usa o CNPJ, que é fato, e não a quantidade, que é coincidência', () => {
    // Caso real: VIIA3 saiu com 1000 no mesmo ano em que WIZC3 entrou com 1000,
    // e são empresas sem relação. Só o CNPJ separa as duas histórias.
    const movimentos = diffYears(
      anos(
        [2022, [item('VIIA3', '1000', 'via'), item('WIZS3', '1000', 'wiz')]],
        [2023, [item('BHIA3', '40', 'via'), item('WIZC3', '1000', 'wiz')]],
      ),
    )

    const via = movimentos.find((m) => m.symbol === 'BHIA3')
    const wiz = movimentos.find((m) => m.symbol === 'WIZC3')

    expect(via?.fromSymbol).toBe('VIIA3')
    expect(wiz?.fromSymbol).toBe('WIZS3')
    expect(via?.confirmar).toBe(false)
  })

  it('não pareia empresas diferentes só porque a quantidade bate', () => {
    const movimentos = diffYears(
      anos([2022, [item('AAAA3', '5', 'aaa')]], [2023, [item('BBBB3', '5', 'bbb')]]),
    )

    // O primeiro ano é todo ENTRADA por definição; o que interessa é 2023.
    expect(
      movimentos.filter((m) => m.year === 2023).map((m) => m.kind).sort(),
    ).toEqual(['ENTRADA', 'SAIDA'])
  })

  it('entende o papel que some virando outro que já estava lá', () => {
    // AESB1, o recibo de subscrição, desaparece dentro de AESB3. Nada "entra",
    // e lido como venda o recibo viraria lucro realizado.
    const movimentos = diffYears(
      anos(
        [2022, [item('AESB1', '5', 'aes'), item('AESB3', '1000', 'aes')]],
        [2023, [item('AESB3', '1000', 'aes')]],
      ),
    )

    const troca = movimentos.find((m) => m.fromSymbol === 'AESB1')
    expect(troca?.symbol).toBe('AESB3')
    expect(troca?.kind).toBe('RENOMEACAO')
  })
})

describe('evento societário x negócio', () => {
  /** O primeiro ano só apresenta a carteira; o movimento é sempre no segundo. */
  const segundoAno = (fotos: YearSnapshot[]) => diffYears(fotos).find((m) => m.year === 2021)

  it('lê fator redondo como desdobramento quando o preço confirma', () => {
    // Um desdobramento 1:2 de verdade divide o preço pela metade — é assim que
    // a B3 registra o evento no dia em que ele acontece.
    const m = segundoAno(
      anos([2020, [item('WEGE3', '100', '', '50')]], [2021, [item('WEGE3', '200', '', '25')]]),
    )

    expect(m?.kind).toBe('DESDOBRAMENTO')
    expect(m?.confirmar).toBe(true)
  })

  it('não lê fator redondo como desdobramento quando o preço não confirma', () => {
    // Caso real que corrompeu uma carteira: 100 ações viraram 300 — um "1:3"
    // tão redondo quanto um desdobramento — mas o preço não caiu, ele SUBIU.
    // Foi uma compra comum, e nada aqui distinguia os dois antes desta
    // checagem: um desdobramento mal detectado zera o preço e destrói o custo
    // médio real da posição.
    const m = segundoAno(
      anos([2020, [item('BBAS3', '100', '', '30')]], [2021, [item('BBAS3', '300', '', '32')]]),
    )

    expect(m?.kind).toBe('AUMENTO')
    expect(m?.confirmar).toBe(false)
  })

  it('lê aumento pequeno como bonificação, mesmo em quantidade redonda', () => {
    // 5% de 1000 são 50 ações inteiras. O filtro que exigia fração perdia
    // justamente o caso mais comum.
    const m = segundoAno(anos([2020, [item('ITSA4', '1000')]], [2021, [item('ITSA4', '1050')]]))

    expect(m?.kind).toBe('BONIFICACAO')
    expect(m?.confirmar).toBe(true)
  })

  it('aumento grande continua sendo compra', () => {
    const m = segundoAno(anos([2020, [item('KLBN11', '308')]], [2021, [item('KLBN11', '400')]]))

    expect(m?.kind).toBe('AUMENTO')
    expect(m?.confirmar).toBe(false)
  })
})

describe('propostas', () => {
  const fotos = anos([2020, [item('PETR4', '100', '', '30')]], [2021, [item('PETR4', '150', '', '35')]])

  it('nasce em 31/12, que é a data do preço do relatório', () => {
    const [entrada] = toProposals(diffYears(fotos))

    expect(entrada?.date).toBe('2020-12-31')
    expect(entrada?.unitPrice).toBe('30')
  })

  it('bonificação e desdobramento vão sem preço', () => {
    const propostas = toProposals(
      diffYears(anos([2020, [item('ITSA4', '1000')]], [2021, [item('ITSA4', '1050')]])),
    )
    const bonus = propostas.find((p) => p.type === 'BONUS')

    // Campo vazio de propósito: preencher convidaria a inventar custo onde não
    // houve desembolso.
    expect(bonus?.unitPrice).toBe('')
    expect(validarProposta(bonus!)).toBeNull()
  })

  it('recusa data fora do ano do relatório', () => {
    const [p] = toProposals(diffYears(fotos))

    // Deslocar o negócio para outro exercício é o erro mais fácil de cometer
    // digitando e o mais difícil de notar depois.
    expect(validarProposta({ ...p!, date: '2019-06-01' })).toContain('2020')
  })

  it('recusa compra sem preço', () => {
    const [p] = toProposals(diffYears(fotos))

    expect(validarProposta({ ...p!, unitPrice: '' })).toContain('preço')
  })
})

describe('leitura do relatório', () => {
  const csv =
    'Produto;Instituição;Código de Negociação;CNPJ da Empresa;Quantidade;Preço de Fechamento\n' +
    'ITSA4 - ITAUSA S.A.;XP;ITSA4;61532644000115;1.297,44; R$11,73 \n' +
    ';;;;;\n'

  it('lê quantidade e preço em português', () => {
    const r = readSnapshot({ nome: 'relatorio-2025.csv', csv })

    expect(r.year).toBe(2025)
    expect(r.items[0]?.quantity).toBe('1297.44')
    expect(r.items[0]?.closingPrice).toBe('11.73')
    // A linha vazia do fim de toda aba exportada não vira ativo.
    expect(r.items).toHaveLength(1)
  })

  it('guarda o CNPJ só com dígitos', () => {
    const r = readSnapshot({ nome: '2025.csv', csv })

    expect(r.items[0]?.issuer).toBe('61532644000115')
  })

  it('recusa arquivo sem ano no nome', () => {
    expect(readSnapshot({ nome: 'relatorio.csv', csv }).erro).toContain('ano')
  })
})
