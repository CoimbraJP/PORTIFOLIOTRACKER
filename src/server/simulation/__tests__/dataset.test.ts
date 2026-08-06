import { describe, expect, it } from 'vitest'
import { money } from '@/core/money/decimal'
import { CARTEIRA_SIMULADA, SIMULACAO_ATE, quantidadeNaData } from '../dataset'

/**
 * Guarda-corpo do conjunto de proventos.
 *
 * São centenas de linhas transcritas à mão de várias fontes. Um zero a mais
 * numa delas não quebra nada — só produz um número plausível e errado na tela,
 * que é o tipo de defeito que este projeto trata como o pior de todos. Estes
 * testes existem para que a transcrição não passe em silêncio.
 */
describe('conjunto de proventos da simulação', () => {
  it('paga sempre depois da data-com, nunca antes', () => {
    for (const ativo of CARTEIRA_SIMULADA) {
      for (const p of ativo.proventos) {
        expect(
          p.paymentDate >= p.exDate,
          `${ativo.symbol}: pagamento ${p.paymentDate} antes da data-com ${p.exDate}`,
        ).toBe(true)
      }
    }
  })

  it('não tem provento anterior a 2020', () => {
    // A simulação parte de uma carteira montada em 2020. Provento de antes
    // seria renda de um período que a premissa não cobre.
    for (const ativo of CARTEIRA_SIMULADA) {
      for (const p of ativo.proventos) {
        expect(p.exDate >= '2020-01-01', `${ativo.symbol} ${p.exDate}`).toBe(true)
      }
    }
  })

  it('não tem pagamento depois do corte da série', () => {
    // Dinheiro anunciado e não pago não é renda recebida — o seed descarta, e
    // o conjunto não deveria nem carregar.
    for (const ativo of CARTEIRA_SIMULADA) {
      for (const p of ativo.proventos) {
        expect(p.paymentDate <= SIMULACAO_ATE, `${ativo.symbol} ${p.paymentDate}`).toBe(true)
      }
    }
  })

  it('só usa valores positivos', () => {
    for (const ativo of CARTEIRA_SIMULADA) {
      for (const p of ativo.proventos) {
        expect(money(p.valuePerShare).greaterThan(0), `${ativo.symbol} ${p.exDate}`).toBe(true)
      }
    }
  })

  it('descreve a carteira exportada: 12 ativos, sem símbolo repetido', () => {
    expect(CARTEIRA_SIMULADA).toHaveLength(12)

    const simbolos = CARTEIRA_SIMULADA.map((a) => a.symbol)
    expect(new Set(simbolos).size).toBe(simbolos.length)
  })

  it('BHIA3 entra sem provento nenhum, e isso é o dado', () => {
    // A empresa deu prejuízo o período inteiro. Uma linha zerada na tela de
    // renda passiva informa; inventar um dividendo para "preencher" mentiria.
    const bhia = CARTEIRA_SIMULADA.find((a) => a.symbol === 'BHIA3')!
    expect(bhia.proventos).toHaveLength(0)
  })
})

describe('engenharia reversa da quantidade', () => {
  const acharAtivo = (symbol: string) => CARTEIRA_SIMULADA.find((a) => a.symbol === symbol)!

  it('desfaz o desdobramento para trás', () => {
    // WEGE3 desdobrou 1:2 em 27/04/2021. Quem tem 200 hoje tinha 100 antes —
    // e o dividendo de 2020 tem que ser apurado sobre 100. Sem isto, cinco
    // anos de provento antigo entrariam dobrados.
    const wege = acharAtivo('WEGE3')

    expect(quantidadeNaData(money('200'), wege, '2020-06-26').toFixed(0)).toBe('100')
    expect(quantidadeNaData(money('200'), wege, '2021-06-25').toFixed(0)).toBe('200')
  })

  it('desfaz o grupamento no sentido contrário', () => {
    // BHIA3 agrupou 25:1 em 15/12/2023: as 40 de hoje eram 1.000 antes.
    const bhia = acharAtivo('BHIA3')

    expect(quantidadeNaData(money('40'), bhia, '2020-01-02').toFixed(0)).toBe('1000')
    expect(quantidadeNaData(money('40'), bhia, '2024-01-02').toFixed(0)).toBe('40')
  })

  it('acumula bonificações sucessivas', () => {
    // Itaúsa bonificou cinco vezes: 5%, 10%, 5%, 5% e 2%. Fator 1,29885525.
    const itsa = acharAtivo('ITSA4')

    const em2020 = quantidadeNaData(money('1297'), itsa, '2020-02-20')
    expect(em2020.toFixed(2)).toBe('998.57')

    // Depois da última bonificação, a quantidade é a de hoje.
    expect(quantidadeNaData(money('1297'), itsa, '2026-01-01').toFixed(2)).toBe('1297.00')
  })

  it('não mexe na quantidade de quem nunca teve evento', () => {
    const taee = acharAtivo('TAEE11')

    expect(quantidadeNaData(money('100'), taee, '2020-05-06').toFixed(0)).toBe('100')
    expect(quantidadeNaData(money('100'), taee, '2026-04-29').toFixed(0)).toBe('100')
  })

  it('a data do próprio evento já conta com a quantidade nova', () => {
    // O evento em 27/04/2021 vale a partir dele: uma data-com naquele dia já
    // enxerga a posição desdobrada.
    const wege = acharAtivo('WEGE3')
    expect(quantidadeNaData(money('200'), wege, '2021-04-27').toFixed(0)).toBe('200')
  })
})
