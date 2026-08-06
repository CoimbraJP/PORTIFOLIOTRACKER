/**
 * Histórico REAL de proventos, para preencher a Renda Passiva sem API paga.
 *
 * Sem `server-only` de propósito, ao contrário do resto de `server/`: isto é
 * uma constante, não um caminho de I/O, e a marca impediria os testes de
 * conferir os números — que é justamente o que impede a simulação de mentir.
 *
 * Tudo aqui foi pesquisado em fontes públicas (StatusInvest, dadosdemercado,
 * Fundamentus, RI das companhias) em agosto de 2026. Nada é estimado,
 * interpolado ou inventado — o objetivo é ver a tela se comportar com a
 * bagunça do mundo real, e dado sintético não tem bagunça nenhuma: paga sempre
 * no mesmo dia, nunca muda de nome, nunca desdobra.
 *
 * ## O que este conjunto NÃO faz
 *
 * Não cria posição, não lança compra e não mexe em quantidade nem em preço
 * médio. As ações nacionais que já estão cadastradas são a base e continuam
 * intactas — daqui sai só a resposta que a API paga daria: *quanto esta
 * posição recebeu de dividendo e JCP desde 2020?*
 *
 * ## Por que os eventos societários estão aqui
 *
 * Os valores estão **como foram anunciados na época**, não ajustados. Um
 * dividendo pago antes de um desdobramento 1:2 vale o dobro por ação do que
 * valeria depois — e a posição de então era metade da de hoje. `eventos`
 * carrega o que aconteceu no meio do caminho para que `quantidadeNaData`
 * (em `seed.ts`) desfaça isso para trás. Sem essa correção, cinco anos de
 * provento antigo entrariam dobrados, num número plausível o bastante para
 * ninguém conferir.
 *
 * ## Onde a fidelidade dói
 *
 * - **CMIN3** só existe desde o IPO de 18/02/2021; não há provento antes disso.
 * - **BHIA3** era **VVAR3** em 2020 (virou VIIA3 em 2021, BHIA3 em 2023) e
 *   passou por um grupamento de 25:1 em 14/12/2023 — as 40 ações de hoje eram
 *   1.000 naquela época. Nunca pagou nada no período, e a linha zerada fica.
 */

import { money, type Money } from '@/core/money/decimal'

export type ProventoTipo = 'DIVIDEND' | 'JCP'

/** Um provento anunciado pelo emissor, como saiu no fato relevante. */
export interface ProventoSimulado {
  /** Data-com: quem tinha o papel no fim deste dia recebe. `YYYY-MM-DD`. */
  exDate: string
  /** Quando o dinheiro caiu na conta. `YYYY-MM-DD`. */
  paymentDate: string
  /** Valor bruto por ação/unit, como anunciado na época. */
  valuePerShare: string
  tipo: ProventoTipo
}

/** Desdobramento, grupamento ou bonificação — o que muda a quantidade. */
export interface EventoSocietario {
  /** Data em que a quantidade muda. `YYYY-MM-DD`. */
  date: string
  /**
   * `SPLIT` multiplica a quantidade pela razão; `REVERSE_SPLIT` divide.
   *
   * Bonificação entra como `SPLIT` com razão 1,05 / 1,10 / 1,40: é
   * aritmeticamente idêntica (a quantidade cresce, o custo total não muda) e
   * evita inventar um terceiro caminho no motor para a mesma conta.
   */
  tipo: 'SPLIT' | 'REVERSE_SPLIT'
  ratio: string
  descricao: string
}

export interface AtivoSimulado {
  symbol: string
  name: string
  /**
   * Quantidade de referência do CSV exportado pelo usuário.
   *
   * Serve só de documentação e de conferência nos testes — quem manda na
   * apuração é a quantidade que estiver na posição do banco no momento em que
   * a simulação roda. Se o usuário comprar mais antes de clicar no botão, é a
   * posição nova que vale.
   */
  quantidadeHoje: string
  eventos: EventoSocietario[]
  proventos: ProventoSimulado[]
}

/**
 * Corte da série: nada com pagamento depois desta data entra.
 *
 * Provento anunciado e ainda não pago é fato do mercado, mas não é renda
 * recebida — deixá-lo entrar encheria o gráfico de dinheiro que ainda não
 * existe, exatamente o erro que a tela deveria ajudar a evitar.
 */
export const SIMULACAO_ATE = '2026-08-06'

/**
 * A quantidade que existia numa data-com, partindo da de hoje.
 *
 * É a engenharia reversa que a simulação faz no lugar do ledger: a carteira
 * foi cadastrada com a posição de hoje, então não há histórico de compras para
 * reconstruir. Desfaz para trás todo evento societário POSTERIOR à data — se
 * um desdobramento 1:2 veio depois, a posição de então era metade da de hoje.
 * Grupamento é o inverso: as 40 BHIA3 de hoje eram 1.000 antes do 25:1.
 *
 * O evento vale a partir do próprio dia: uma data-com que caia nele já enxerga
 * a quantidade nova.
 */
export function quantidadeNaData(
  quantidadeHoje: Money,
  ativo: AtivoSimulado,
  dataISO: string,
): Money {
  let quantidade = quantidadeHoje

  for (const evento of ativo.eventos) {
    if (evento.date <= dataISO) continue

    quantidade =
      evento.tipo === 'SPLIT'
        ? quantidade.dividedBy(money(evento.ratio))
        : quantidade.times(money(evento.ratio))
  }

  return quantidade
}

export const CARTEIRA_SIMULADA: AtivoSimulado[] = [
  {
    symbol: 'BBSE3',
    name: 'BB Seguridade Participações S.A.',
    quantidadeHoje: '500',
    eventos: [],
    proventos: [
      { exDate: '2020-02-13', paymentDate: '2020-02-27', valuePerShare: '1.898384336', tipo: 'DIVIDEND' },
      { exDate: '2020-02-13', paymentDate: '2020-02-27', valuePerShare: '0.012456887', tipo: 'JCP' },
      { exDate: '2020-08-12', paymentDate: '2020-08-24', valuePerShare: '0.875255324', tipo: 'DIVIDEND' },
      { exDate: '2021-02-11', paymentDate: '2021-02-25', valuePerShare: '0.474807524', tipo: 'DIVIDEND' },
      { exDate: '2021-02-11', paymentDate: '2021-02-25', valuePerShare: '0.001313910', tipo: 'JCP' },
      { exDate: '2021-08-11', paymentDate: '2021-08-23', valuePerShare: '0.520874997', tipo: 'DIVIDEND' },
      { exDate: '2022-02-10', paymentDate: '2022-02-23', valuePerShare: '0.917154467', tipo: 'DIVIDEND' },
      { exDate: '2022-02-10', paymentDate: '2022-02-23', valuePerShare: '0.012893915', tipo: 'JCP' },
      { exDate: '2022-08-17', paymentDate: '2022-08-29', valuePerShare: '1.036044528', tipo: 'DIVIDEND' },
      { exDate: '2023-02-14', paymentDate: '2023-03-01', valuePerShare: '1.839873606', tipo: 'DIVIDEND' },
      { exDate: '2023-02-14', paymentDate: '2023-03-01', valuePerShare: '0.038703573', tipo: 'JCP' },
      { exDate: '2023-08-16', paymentDate: '2023-08-28', valuePerShare: '1.607636762', tipo: 'DIVIDEND' },
      { exDate: '2024-02-08', paymentDate: '2024-02-22', valuePerShare: '1.241875561', tipo: 'DIVIDEND' },
      { exDate: '2024-02-08', paymentDate: '2024-02-22', valuePerShare: '0.019412946', tipo: 'JCP' },
      { exDate: '2024-08-16', paymentDate: '2024-08-30', valuePerShare: '1.390908557', tipo: 'DIVIDEND' },
      { exDate: '2025-02-20', paymentDate: '2025-03-06', valuePerShare: '2.272329213', tipo: 'DIVIDEND' },
      { exDate: '2025-02-20', paymentDate: '2025-03-06', valuePerShare: '0.047832047', tipo: 'JCP' },
      { exDate: '2025-08-14', paymentDate: '2025-08-26', valuePerShare: '1.942095156', tipo: 'DIVIDEND' },
      { exDate: '2026-02-12', paymentDate: '2026-03-02', valuePerShare: '2.549965016', tipo: 'DIVIDEND' },
      { exDate: '2026-02-12', paymentDate: '2026-03-02', valuePerShare: '0.056841626', tipo: 'JCP' },
    ],
  },
  {
    symbol: 'ITSA4',
    name: 'Itaúsa S.A.',
    quantidadeHoje: '1297',
    // Itaúsa bonifica quase todo ano. Fator acumulado 2020→hoje: 1,29885525.
    eventos: [
      { date: '2021-12-21', tipo: 'SPLIT', ratio: '1.05', descricao: 'Bonificação de 5%' },
      { date: '2022-11-11', tipo: 'SPLIT', ratio: '1.10', descricao: 'Bonificação de 10%' },
      { date: '2023-11-28', tipo: 'SPLIT', ratio: '1.05', descricao: 'Bonificação de 5%' },
      { date: '2024-12-03', tipo: 'SPLIT', ratio: '1.05', descricao: 'Bonificação de 5%' },
      { date: '2025-12-19', tipo: 'SPLIT', ratio: '1.02', descricao: 'Bonificação de 2%' },
    ],
    proventos: [
      { exDate: '2020-02-20', paymentDate: '2020-03-06', valuePerShare: '0.226000', tipo: 'DIVIDEND' },
      { exDate: '2020-02-20', paymentDate: '2020-03-06', valuePerShare: '0.217400', tipo: 'JCP' },
      { exDate: '2020-02-28', paymentDate: '2020-04-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2020-05-29', paymentDate: '2020-07-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2020-08-17', paymentDate: '2020-08-26', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2020-08-31', paymentDate: '2020-10-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2020-11-30', paymentDate: '2021-01-04', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2020-12-10', paymentDate: '2021-03-12', valuePerShare: '0.101650', tipo: 'JCP' },
      { exDate: '2021-01-22', paymentDate: '2021-03-12', valuePerShare: '0.020800', tipo: 'JCP' },
      { exDate: '2021-02-26', paymentDate: '2021-04-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2021-03-09', paymentDate: '2021-08-26', valuePerShare: '0.015456', tipo: 'JCP' },
      { exDate: '2021-03-25', paymentDate: '2021-08-26', valuePerShare: '0.019080', tipo: 'JCP' },
      { exDate: '2021-04-27', paymentDate: '2021-08-26', valuePerShare: '0.021310', tipo: 'JCP' },
      { exDate: '2021-05-24', paymentDate: '2021-08-26', valuePerShare: '0.018400', tipo: 'JCP' },
      { exDate: '2021-05-31', paymentDate: '2021-07-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2021-08-13', paymentDate: '2021-08-26', valuePerShare: '0.037340', tipo: 'JCP' },
      { exDate: '2021-08-31', paymentDate: '2021-10-01', valuePerShare: '0.020000', tipo: 'DIVIDEND' },
      { exDate: '2021-11-23', paymentDate: '2022-03-11', valuePerShare: '0.154720', tipo: 'JCP' },
      { exDate: '2021-11-30', paymentDate: '2022-01-03', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2021-12-13', paymentDate: '2022-04-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2022-01-14', paymentDate: '2022-03-11', valuePerShare: '0.133340', tipo: 'JCP' },
      { exDate: '2022-03-24', paymentDate: '2022-08-30', valuePerShare: '0.113370', tipo: 'JCP' },
      { exDate: '2022-05-31', paymentDate: '2022-07-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2022-08-18', paymentDate: '2022-08-30', valuePerShare: '0.010300', tipo: 'JCP' },
      { exDate: '2022-08-18', paymentDate: '2023-10-02', valuePerShare: '0.049400', tipo: 'JCP' },
      { exDate: '2022-08-31', paymentDate: '2022-10-03', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2022-11-18', paymentDate: '2023-10-02', valuePerShare: '0.051540', tipo: 'JCP' },
      { exDate: '2022-11-30', paymentDate: '2023-01-02', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2022-12-08', paymentDate: '2023-03-10', valuePerShare: '0.141000', tipo: 'JCP' },
      { exDate: '2022-12-08', paymentDate: '2023-10-02', valuePerShare: '0.044500', tipo: 'JCP' },
      { exDate: '2023-02-28', paymentDate: '2023-04-03', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2023-03-23', paymentDate: '2023-08-25', valuePerShare: '0.077300', tipo: 'JCP' },
      { exDate: '2023-05-31', paymentDate: '2023-07-03', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2023-06-22', paymentDate: '2023-08-25', valuePerShare: '0.114400', tipo: 'JCP' },
      { exDate: '2023-07-25', paymentDate: '2024-03-08', valuePerShare: '0.051500', tipo: 'JCP' },
      { exDate: '2023-08-17', paymentDate: '2023-10-02', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2023-09-21', paymentDate: '2024-03-08', valuePerShare: '0.116500', tipo: 'JCP' },
      { exDate: '2023-10-19', paymentDate: '2024-03-08', valuePerShare: '0.051500', tipo: 'JCP' },
      { exDate: '2023-11-30', paymentDate: '2024-01-02', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2023-12-18', paymentDate: '2024-03-08', valuePerShare: '0.079400', tipo: 'JCP' },
      { exDate: '2024-02-22', paymentDate: '2024-03-08', valuePerShare: '0.300500', tipo: 'DIVIDEND' },
      { exDate: '2024-02-29', paymentDate: '2024-04-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2024-03-21', paymentDate: '2024-08-30', valuePerShare: '0.070000', tipo: 'JCP' },
      { exDate: '2024-05-31', paymentDate: '2024-07-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2024-06-20', paymentDate: '2024-08-30', valuePerShare: '0.094600', tipo: 'JCP' },
      { exDate: '2024-08-30', paymentDate: '2024-10-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2024-09-19', paymentDate: '2025-03-07', valuePerShare: '0.048400', tipo: 'JCP' },
      { exDate: '2024-11-29', paymentDate: '2025-01-02', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2024-12-11', paymentDate: '2025-03-07', valuePerShare: '0.058100', tipo: 'JCP' },
      { exDate: '2025-02-17', paymentDate: '2025-03-07', valuePerShare: '0.408150', tipo: 'DIVIDEND' },
      { exDate: '2025-02-17', paymentDate: '2025-03-07', valuePerShare: '0.101100', tipo: 'JCP' },
      { exDate: '2025-02-17', paymentDate: '2025-04-22', valuePerShare: '0.092240', tipo: 'DIVIDEND' },
      { exDate: '2025-02-28', paymentDate: '2025-04-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2025-05-30', paymentDate: '2025-07-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2025-06-20', paymentDate: '2025-08-29', valuePerShare: '0.059100', tipo: 'JCP' },
      { exDate: '2025-08-18', paymentDate: '2025-08-29', valuePerShare: '0.185900', tipo: 'JCP' },
      { exDate: '2025-08-29', paymentDate: '2025-10-01', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2025-11-28', paymentDate: '2026-01-02', valuePerShare: '0.0235295', tipo: 'JCP' },
      { exDate: '2025-12-09', paymentDate: '2025-12-19', valuePerShare: '0.775364', tipo: 'DIVIDEND' },
      { exDate: '2025-12-09', paymentDate: '2026-03-06', valuePerShare: '0.018200', tipo: 'JCP' },
      { exDate: '2026-02-27', paymentDate: '2026-04-01', valuePerShare: '0.0242425', tipo: 'JCP' },
      { exDate: '2026-05-29', paymentDate: '2026-07-01', valuePerShare: '0.0242425', tipo: 'JCP' },
    ],
  },
  {
    symbol: 'ALUP11',
    name: 'Alupar Investimento S.A.',
    quantidadeHoje: '449',
    // Bonificação de 4% ao ano desde 2023. Fator acumulado: 1,124864.
    eventos: [
      { date: '2023-04-18', tipo: 'SPLIT', ratio: '1.04', descricao: 'Bonificação de 4%' },
      { date: '2024-04-22', tipo: 'SPLIT', ratio: '1.04', descricao: 'Bonificação de 4%' },
      { date: '2025-04-17', tipo: 'SPLIT', ratio: '1.04', descricao: 'Bonificação de 4%' },
    ],
    // Alupar não pagou um único JCP no período — tudo saiu como dividendo.
    proventos: [
      { exDate: '2020-04-27', paymentDate: '2020-06-17', valuePerShare: '0.330000', tipo: 'DIVIDEND' },
      { exDate: '2020-04-27', paymentDate: '2020-11-30', valuePerShare: '0.360000', tipo: 'DIVIDEND' },
      { exDate: '2021-04-27', paymentDate: '2021-05-31', valuePerShare: '0.300000', tipo: 'DIVIDEND' },
      { exDate: '2021-04-27', paymentDate: '2021-08-30', valuePerShare: '0.300000', tipo: 'DIVIDEND' },
      { exDate: '2021-04-27', paymentDate: '2021-11-30', valuePerShare: '0.153110', tipo: 'DIVIDEND' },
      { exDate: '2021-04-27', paymentDate: '2021-11-30', valuePerShare: '0.086890', tipo: 'DIVIDEND' },
      { exDate: '2022-04-11', paymentDate: '2022-05-31', valuePerShare: '0.450000', tipo: 'DIVIDEND' },
      { exDate: '2022-04-11', paymentDate: '2022-08-31', valuePerShare: '0.450000', tipo: 'DIVIDEND' },
      { exDate: '2022-04-11', paymentDate: '2022-11-30', valuePerShare: '0.330000', tipo: 'DIVIDEND' },
      { exDate: '2023-04-17', paymentDate: '2023-05-16', valuePerShare: '1.440000', tipo: 'DIVIDEND' },
      { exDate: '2023-05-15', paymentDate: '2023-07-05', valuePerShare: '0.120000', tipo: 'DIVIDEND' },
      { exDate: '2023-08-16', paymentDate: '2023-10-05', valuePerShare: '0.120000', tipo: 'DIVIDEND' },
      { exDate: '2023-11-16', paymentDate: '2024-01-04', valuePerShare: '0.120000', tipo: 'DIVIDEND' },
      { exDate: '2024-04-19', paymentDate: '2024-07-01', valuePerShare: '0.780000', tipo: 'DIVIDEND' },
      { exDate: '2024-05-16', paymentDate: '2024-07-08', valuePerShare: '0.210000', tipo: 'DIVIDEND' },
      { exDate: '2024-08-16', paymentDate: '2024-10-03', valuePerShare: '0.180000', tipo: 'DIVIDEND' },
      { exDate: '2024-11-14', paymentDate: '2025-01-06', valuePerShare: '0.240000', tipo: 'DIVIDEND' },
      { exDate: '2025-04-16', paymentDate: '2025-06-11', valuePerShare: '0.240000', tipo: 'DIVIDEND' },
      { exDate: '2025-05-15', paymentDate: '2025-07-08', valuePerShare: '0.210000', tipo: 'DIVIDEND' },
      { exDate: '2025-08-14', paymentDate: '2025-10-06', valuePerShare: '0.210000', tipo: 'DIVIDEND' },
      { exDate: '2025-11-13', paymentDate: '2026-01-06', valuePerShare: '0.300000', tipo: 'DIVIDEND' },
      { exDate: '2025-12-26', paymentDate: '2026-02-12', valuePerShare: '0.330000', tipo: 'DIVIDEND' },
      { exDate: '2026-04-16', paymentDate: '2026-06-10', valuePerShare: '0.030000', tipo: 'DIVIDEND' },
      { exDate: '2026-05-14', paymentDate: '2026-07-06', valuePerShare: '0.210000', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'VIVT3',
    name: 'Telefônica Brasil S.A.',
    quantidadeHoje: '400',
    // Grupamento 40:1 seguido de desdobramento 1:80 em 15/04/2025 — efeito
    // líquido 2:1. Modelado como o efeito líquido: duas pernas que se anulam
    // parcialmente no mesmo dia produziriam a mesma quantidade com o dobro do
    // ruído no extrato.
    eventos: [
      {
        date: '2025-04-15',
        tipo: 'SPLIT',
        ratio: '2',
        descricao: 'Grupamento 40:1 + desdobramento 1:80 (efeito líquido 2:1)',
      },
    ],
    proventos: [
      { exDate: '2020-02-28', paymentDate: '2021-07-13', valuePerShare: '0.149947705870', tipo: 'JCP' },
      { exDate: '2020-03-31', paymentDate: '2021-07-13', valuePerShare: '0.083304281040', tipo: 'JCP' },
      { exDate: '2020-05-28', paymentDate: '2020-12-09', valuePerShare: '1.219338834950', tipo: 'DIVIDEND' },
      { exDate: '2020-06-30', paymentDate: '2021-07-13', valuePerShare: '0.499825686260', tipo: 'JCP' },
      { exDate: '2020-09-28', paymentDate: '2021-07-13', valuePerShare: '0.360985217850', tipo: 'JCP' },
      { exDate: '2020-11-27', paymentDate: '2021-07-13', valuePerShare: '0.236902129730', tipo: 'JCP' },
      { exDate: '2020-12-28', paymentDate: '2021-07-13', valuePerShare: '0.154012544710', tipo: 'JCP' },
      { exDate: '2020-12-28', paymentDate: '2021-10-05', valuePerShare: '0.710827129450', tipo: 'DIVIDEND' },
      { exDate: '2021-02-26', paymentDate: '2022-07-19', valuePerShare: '0.088895606970', tipo: 'JCP' },
      { exDate: '2021-03-31', paymentDate: '2022-07-19', valuePerShare: '0.160098376680', tipo: 'JCP' },
      { exDate: '2021-04-15', paymentDate: '2021-10-05', valuePerShare: '0.941817867620', tipo: 'DIVIDEND' },
      { exDate: '2021-04-30', paymentDate: '2022-07-19', valuePerShare: '0.166113984570', tipo: 'JCP' },
      { exDate: '2021-06-30', paymentDate: '2022-07-19', valuePerShare: '0.373900250080', tipo: 'JCP' },
      { exDate: '2021-09-30', paymentDate: '2022-07-19', valuePerShare: '0.357288351970', tipo: 'JCP' },
      { exDate: '2021-12-27', paymentDate: '2022-07-19', valuePerShare: '0.480041522050', tipo: 'JCP' },
      { exDate: '2021-12-27', paymentDate: '2022-10-18', valuePerShare: '0.894487308170', tipo: 'DIVIDEND' },
      { exDate: '2022-02-25', paymentDate: '2023-04-18', valuePerShare: '0.107395007130', tipo: 'JCP' },
      { exDate: '2022-03-31', paymentDate: '2023-04-18', valuePerShare: '0.149291203790', tipo: 'JCP' },
      { exDate: '2022-04-26', paymentDate: '2022-10-18', valuePerShare: '1.212002339290', tipo: 'DIVIDEND' },
      { exDate: '2022-04-29', paymentDate: '2023-04-18', valuePerShare: '0.089621974270', tipo: 'JCP' },
      { exDate: '2022-06-30', paymentDate: '2023-04-18', valuePerShare: '0.287312964990', tipo: 'JCP' },
      { exDate: '2022-08-31', paymentDate: '2023-04-18', valuePerShare: '0.179750067840', tipo: 'JCP' },
      { exDate: '2022-12-29', paymentDate: '2023-04-18', valuePerShare: '0.429801993930', tipo: 'JCP' },
      { exDate: '2022-12-29', paymentDate: '2023-07-18', valuePerShare: '0.601121669830', tipo: 'DIVIDEND' },
      { exDate: '2023-02-28', paymentDate: '2023-10-18', valuePerShare: '0.063771752720', tipo: 'JCP' },
      { exDate: '2023-03-31', paymentDate: '2023-10-18', valuePerShare: '0.174525948150', tipo: 'JCP' },
      { exDate: '2023-04-13', paymentDate: '2023-07-18', valuePerShare: '0.497538188650', tipo: 'DIVIDEND' },
      { exDate: '2023-05-31', paymentDate: '2024-04-23', valuePerShare: '0.192781741790', tipo: 'JCP' },
      { exDate: '2023-07-31', paymentDate: '2024-04-23', valuePerShare: '0.244229412130', tipo: 'JCP' },
      { exDate: '2023-08-31', paymentDate: '2024-04-23', valuePerShare: '0.159970402990', tipo: 'JCP' },
      { exDate: '2023-09-22', paymentDate: '2024-04-23', valuePerShare: '0.120732379610', tipo: 'JCP' },
      { exDate: '2023-10-23', paymentDate: '2024-04-23', valuePerShare: '0.090574966340', tipo: 'JCP' },
      { exDate: '2023-12-26', paymentDate: '2024-04-23', valuePerShare: '0.514346016870', tipo: 'JCP' },
      { exDate: '2024-03-28', paymentDate: '2024-12-17', valuePerShare: '0.181533888310', tipo: 'JCP' },
      { exDate: '2024-04-29', paymentDate: '2024-12-17', valuePerShare: '0.230094187890', tipo: 'JCP' },
      { exDate: '2024-06-26', paymentDate: '2024-12-17', valuePerShare: '0.106226505850', tipo: 'JCP' },
      { exDate: '2024-07-26', paymentDate: '2025-04-08', valuePerShare: '0.395624152440', tipo: 'JCP' },
      { exDate: '2024-08-26', paymentDate: '2025-04-08', valuePerShare: '0.244164602730', tipo: 'JCP' },
      { exDate: '2024-12-26', paymentDate: '2025-04-08', valuePerShare: '0.737697690410', tipo: 'JCP' },
      { exDate: '2025-02-24', paymentDate: '2025-12-02', valuePerShare: '0.055466189800', tipo: 'JCP' },
      { exDate: '2025-03-24', paymentDate: '2025-12-02', valuePerShare: '0.123453604410', tipo: 'JCP' },
      { exDate: '2025-04-11', paymentDate: '2026-04-14', valuePerShare: '0.074072163925', tipo: 'JCP' },
      { exDate: '2025-05-22', paymentDate: '2026-04-14', valuePerShare: '0.154317008180', tipo: 'JCP' },
      { exDate: '2025-06-23', paymentDate: '2026-04-14', valuePerShare: '0.061933111670', tipo: 'JCP' },
      { exDate: '2025-07-25', paymentDate: '2026-04-14', valuePerShare: '0.102534435230', tipo: 'JCP' },
      { exDate: '2025-08-25', paymentDate: '2026-04-14', valuePerShare: '0.077933173530', tipo: 'JCP' },
      { exDate: '2025-09-22', paymentDate: '2026-04-14', valuePerShare: '0.124806368690', tipo: 'JCP' },
      { exDate: '2025-10-27', paymentDate: '2026-04-14', valuePerShare: '0.118566050260', tipo: 'JCP' },
      { exDate: '2025-11-24', paymentDate: '2026-04-14', valuePerShare: '0.106301438200', tipo: 'JCP' },
      { exDate: '2025-12-29', paymentDate: '2026-04-14', valuePerShare: '0.109525379990', tipo: 'JCP' },
      { exDate: '2026-05-22', paymentDate: '2026-07-14', valuePerShare: '1.251719000000', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'BBAS3',
    name: 'Banco do Brasil S.A.',
    quantidadeHoje: '600',
    eventos: [
      { date: '2024-04-15', tipo: 'SPLIT', ratio: '2', descricao: 'Desdobramento 1:2' },
    ],
    proventos: [
      { exDate: '2020-02-21', paymentDate: '2020-03-05', valuePerShare: '0.438882426100', tipo: 'JCP' },
      { exDate: '2020-03-11', paymentDate: '2020-03-31', valuePerShare: '0.181420527440', tipo: 'JCP' },
      { exDate: '2020-08-21', paymentDate: '2020-08-31', valuePerShare: '0.440619820230', tipo: 'JCP' },
      { exDate: '2020-08-21', paymentDate: '2020-08-31', valuePerShare: '0.001566505370', tipo: 'JCP' },
      { exDate: '2020-09-11', paymentDate: '2020-09-30', valuePerShare: '0.102862818710', tipo: 'JCP' },
      { exDate: '2020-11-16', paymentDate: '2020-11-27', valuePerShare: '0.194773740270', tipo: 'JCP' },
      { exDate: '2020-12-11', paymentDate: '2020-12-30', valuePerShare: '0.116984700020', tipo: 'JCP' },
      { exDate: '2021-02-22', paymentDate: '2021-03-03', valuePerShare: '0.434530972340', tipo: 'JCP' },
      { exDate: '2021-02-22', paymentDate: '2021-03-03', valuePerShare: '0.001332649520', tipo: 'JCP' },
      { exDate: '2021-03-11', paymentDate: '2021-03-31', valuePerShare: '0.145714260200', tipo: 'JCP' },
      { exDate: '2021-05-21', paymentDate: '2021-05-28', valuePerShare: '0.340111379940', tipo: 'JCP' },
      { exDate: '2021-05-21', paymentDate: '2021-05-28', valuePerShare: '0.074334707090', tipo: 'DIVIDEND' },
      { exDate: '2021-06-11', paymentDate: '2021-06-30', valuePerShare: '0.168519020840', tipo: 'JCP' },
      { exDate: '2021-08-23', paymentDate: '2021-08-31', valuePerShare: '0.345588872710', tipo: 'JCP' },
      { exDate: '2021-08-23', paymentDate: '2021-08-31', valuePerShare: '0.002699977020', tipo: 'JCP' },
      { exDate: '2021-09-13', paymentDate: '2021-09-30', valuePerShare: '0.184739648250', tipo: 'JCP' },
      { exDate: '2021-11-22', paymentDate: '2021-11-30', valuePerShare: '0.393703148700', tipo: 'JCP' },
      { exDate: '2021-12-13', paymentDate: '2021-12-30', valuePerShare: '0.174991275800', tipo: 'JCP' },
      { exDate: '2022-03-02', paymentDate: '2022-03-11', valuePerShare: '0.454205589160', tipo: 'JCP' },
      { exDate: '2022-03-02', paymentDate: '2022-03-11', valuePerShare: '0.355822599810', tipo: 'DIVIDEND' },
      { exDate: '2022-03-02', paymentDate: '2022-03-11', valuePerShare: '0.006454354770', tipo: 'JCP' },
      { exDate: '2022-03-02', paymentDate: '2022-03-11', valuePerShare: '0.008238948330', tipo: 'JCP' },
      { exDate: '2022-03-14', paymentDate: '2022-03-31', valuePerShare: '0.210628768500', tipo: 'JCP' },
      { exDate: '2022-05-23', paymentDate: '2022-05-31', valuePerShare: '0.517724066010', tipo: 'JCP' },
      { exDate: '2022-05-23', paymentDate: '2022-05-31', valuePerShare: '0.155347054860', tipo: 'DIVIDEND' },
      { exDate: '2022-06-13', paymentDate: '2022-06-30', valuePerShare: '0.250285024110', tipo: 'JCP' },
      { exDate: '2022-08-22', paymentDate: '2022-08-31', valuePerShare: '0.570678466880', tipo: 'JCP' },
      { exDate: '2022-08-22', paymentDate: '2022-08-31', valuePerShare: '0.200188998190', tipo: 'DIVIDEND' },
      { exDate: '2022-08-22', paymentDate: '2022-08-31', valuePerShare: '0.004433217120', tipo: 'JCP' },
      { exDate: '2022-08-22', paymentDate: '2022-08-31', valuePerShare: '0.012637765170', tipo: 'JCP' },
      { exDate: '2022-09-12', paymentDate: '2022-09-30', valuePerShare: '0.273735512400', tipo: 'JCP' },
      { exDate: '2022-11-21', paymentDate: '2022-11-30', valuePerShare: '0.634477650930', tipo: 'JCP' },
      { exDate: '2022-11-21', paymentDate: '2022-11-30', valuePerShare: '0.170206090370', tipo: 'DIVIDEND' },
      { exDate: '2022-12-12', paymentDate: '2022-12-29', valuePerShare: '0.345525167360', tipo: 'JCP' },
      { exDate: '2023-02-23', paymentDate: '2023-03-03', valuePerShare: '0.573531808270', tipo: 'JCP' },
      { exDate: '2023-02-23', paymentDate: '2023-03-03', valuePerShare: '0.235491391300', tipo: 'DIVIDEND' },
      { exDate: '2023-02-23', paymentDate: '2023-03-03', valuePerShare: '0.005198092540', tipo: 'JCP' },
      { exDate: '2023-02-23', paymentDate: '2023-03-03', valuePerShare: '0.012659789370', tipo: 'JCP' },
      { exDate: '2023-03-13', paymentDate: '2023-03-31', valuePerShare: '0.352036972460', tipo: 'JCP' },
      { exDate: '2023-06-01', paymentDate: '2023-06-12', valuePerShare: '0.654419918290', tipo: 'JCP' },
      { exDate: '2023-06-01', paymentDate: '2023-06-12', valuePerShare: '0.123007923990', tipo: 'DIVIDEND' },
      { exDate: '2023-06-12', paymentDate: '2023-06-30', valuePerShare: '0.338631339490', tipo: 'JCP' },
      { exDate: '2023-08-21', paymentDate: '2023-08-30', valuePerShare: '0.654655141970', tipo: 'JCP' },
      { exDate: '2023-08-21', paymentDate: '2023-08-30', valuePerShare: '0.143721646920', tipo: 'DIVIDEND' },
      { exDate: '2023-08-21', paymentDate: '2023-08-30', valuePerShare: '0.003123585790', tipo: 'JCP' },
      { exDate: '2023-08-21', paymentDate: '2023-08-30', valuePerShare: '0.014227999380', tipo: 'JCP' },
      { exDate: '2023-09-11', paymentDate: '2023-09-29', valuePerShare: '0.334197214370', tipo: 'JCP' },
      { exDate: '2023-11-21', paymentDate: '2023-11-30', valuePerShare: '0.686222025510', tipo: 'JCP' },
      { exDate: '2023-11-21', paymentDate: '2023-11-30', valuePerShare: '0.101988607400', tipo: 'DIVIDEND' },
      { exDate: '2023-12-11', paymentDate: '2023-12-28', valuePerShare: '0.342306470230', tipo: 'JCP' },
      { exDate: '2024-02-21', paymentDate: '2024-02-29', valuePerShare: '0.613636256220', tipo: 'JCP' },
      { exDate: '2024-02-21', paymentDate: '2024-02-29', valuePerShare: '0.220818626070', tipo: 'DIVIDEND' },
      { exDate: '2024-02-21', paymentDate: '2024-02-29', valuePerShare: '0.014823581410', tipo: 'JCP' },
      { exDate: '2024-03-11', paymentDate: '2024-03-27', valuePerShare: '0.410036732830', tipo: 'JCP' },
      { exDate: '2024-06-11', paymentDate: '2024-06-21', valuePerShare: '0.293161465830', tipo: 'JCP' },
      { exDate: '2024-06-11', paymentDate: '2024-06-21', valuePerShare: '0.164785681410', tipo: 'DIVIDEND' },
      { exDate: '2024-06-13', paymentDate: '2024-06-28', valuePerShare: '0.204240444400', tipo: 'JCP' },
      { exDate: '2024-08-21', paymentDate: '2024-08-30', valuePerShare: '0.314481488600', tipo: 'JCP' },
      { exDate: '2024-08-21', paymentDate: '2024-08-30', valuePerShare: '0.151860788810', tipo: 'DIVIDEND' },
      { exDate: '2024-08-21', paymentDate: '2024-08-30', valuePerShare: '0.005605643240', tipo: 'JCP' },
      { exDate: '2024-08-21', paymentDate: '2024-08-30', valuePerShare: '0.002706923730', tipo: 'JCP' },
      { exDate: '2024-09-11', paymentDate: '2024-09-27', valuePerShare: '0.186601977840', tipo: 'JCP' },
      { exDate: '2024-11-25', paymentDate: '2024-12-06', valuePerShare: '0.483304217040', tipo: 'JCP' },
      { exDate: '2024-12-11', paymentDate: '2024-12-27', valuePerShare: '0.176491094030', tipo: 'JCP' },
      { exDate: '2025-03-11', paymentDate: '2025-03-20', valuePerShare: '0.342592494360', tipo: 'JCP' },
      { exDate: '2025-03-11', paymentDate: '2025-03-20', valuePerShare: '0.136001807350', tipo: 'DIVIDEND' },
      { exDate: '2025-03-11', paymentDate: '2025-03-20', valuePerShare: '0.003545264130', tipo: 'JCP' },
      { exDate: '2025-03-11', paymentDate: '2025-03-20', valuePerShare: '0.008930623090', tipo: 'JCP' },
      { exDate: '2025-03-11', paymentDate: '2025-03-21', valuePerShare: '0.149351484680', tipo: 'JCP' },
      { exDate: '2025-06-02', paymentDate: '2025-06-12', valuePerShare: '0.334258401090', tipo: 'JCP' },
      { exDate: '2025-06-02', paymentDate: '2025-06-12', valuePerShare: '0.090446866290', tipo: 'JCP' },
      { exDate: '2025-12-01', paymentDate: '2025-12-11', valuePerShare: '0.071927131390', tipo: 'JCP' },
      { exDate: '2025-12-02', paymentDate: '2025-12-12', valuePerShare: '0.045832632330', tipo: 'JCP' },
      { exDate: '2026-02-23', paymentDate: '2026-03-05', valuePerShare: '0.216304291880', tipo: 'JCP' },
      { exDate: '2026-02-23', paymentDate: '2026-03-05', valuePerShare: '0.005187590000', tipo: 'JCP' },
      { exDate: '2026-03-02', paymentDate: '2026-03-11', valuePerShare: '0.070141901050', tipo: 'JCP' },
      { exDate: '2026-06-01', paymentDate: '2026-06-11', valuePerShare: '0.081577852030', tipo: 'JCP' },
      { exDate: '2026-06-01', paymentDate: '2026-06-11', valuePerShare: '0.059684011660', tipo: 'JCP' },
    ],
  },
  {
    symbol: 'WEGE3',
    name: 'WEG S.A.',
    quantidadeHoje: '200',
    eventos: [
      { date: '2021-04-27', tipo: 'SPLIT', ratio: '2', descricao: 'Desdobramento 1:2' },
    ],
    proventos: [
      { exDate: '2020-02-21', paymentDate: '2020-03-11', valuePerShare: '0.167761411', tipo: 'DIVIDEND' },
      { exDate: '2020-03-20', paymentDate: '2020-08-12', valuePerShare: '0.030235294', tipo: 'JCP' },
      { exDate: '2020-06-26', paymentDate: '2020-08-12', valuePerShare: '0.038235294', tipo: 'JCP' },
      { exDate: '2020-07-24', paymentDate: '2020-08-12', valuePerShare: '0.126801590', tipo: 'DIVIDEND' },
      { exDate: '2020-09-25', paymentDate: '2021-03-10', valuePerShare: '0.034470588', tipo: 'JCP' },
      { exDate: '2020-12-21', paymentDate: '2021-03-10', valuePerShare: '0.036882353', tipo: 'JCP' },
      { exDate: '2021-02-26', paymentDate: '2021-03-10', valuePerShare: '0.349357703', tipo: 'DIVIDEND' },
      { exDate: '2021-03-26', paymentDate: '2021-08-11', valuePerShare: '0.033823529', tipo: 'JCP' },
      { exDate: '2021-06-25', paymentDate: '2021-08-11', valuePerShare: '0.020529412', tipo: 'JCP' },
      { exDate: '2021-07-30', paymentDate: '2021-08-11', valuePerShare: '0.158175000', tipo: 'DIVIDEND' },
      { exDate: '2021-09-24', paymentDate: '2022-03-16', valuePerShare: '0.020705882', tipo: 'JCP' },
      { exDate: '2021-12-17', paymentDate: '2022-03-16', valuePerShare: '0.032000000', tipo: 'JCP' },
      { exDate: '2022-02-18', paymentDate: '2022-03-16', valuePerShare: '0.205203678', tipo: 'DIVIDEND' },
      { exDate: '2022-03-25', paymentDate: '2022-08-17', valuePerShare: '0.036764706', tipo: 'JCP' },
      { exDate: '2022-06-24', paymentDate: '2022-08-17', valuePerShare: '0.043294118', tipo: 'JCP' },
      { exDate: '2022-07-22', paymentDate: '2022-08-17', valuePerShare: '0.131948000', tipo: 'DIVIDEND' },
      { exDate: '2022-09-23', paymentDate: '2023-03-15', valuePerShare: '0.044117647', tipo: 'JCP' },
      { exDate: '2022-12-16', paymentDate: '2023-03-15', valuePerShare: '0.054352941', tipo: 'JCP' },
      { exDate: '2023-02-17', paymentDate: '2023-03-15', valuePerShare: '0.226303730', tipo: 'DIVIDEND' },
      { exDate: '2023-03-17', paymentDate: '2023-08-16', valuePerShare: '0.053235294', tipo: 'JCP' },
      { exDate: '2023-06-23', paymentDate: '2023-08-16', valuePerShare: '0.058294118', tipo: 'JCP' },
      { exDate: '2023-07-21', paymentDate: '2023-08-16', valuePerShare: '0.145202292', tipo: 'DIVIDEND' },
      { exDate: '2023-09-22', paymentDate: '2024-03-13', valuePerShare: '0.059823529', tipo: 'JCP' },
      { exDate: '2023-12-15', paymentDate: '2024-03-13', valuePerShare: '0.071941176', tipo: 'JCP' },
      { exDate: '2024-02-23', paymentDate: '2024-03-13', valuePerShare: '0.297942793', tipo: 'DIVIDEND' },
      { exDate: '2024-03-22', paymentDate: '2024-08-14', valuePerShare: '0.057764706', tipo: 'JCP' },
      { exDate: '2024-06-28', paymentDate: '2024-08-14', valuePerShare: '0.062764706', tipo: 'JCP' },
      { exDate: '2024-08-02', paymentDate: '2024-08-14', valuePerShare: '0.187552062', tipo: 'DIVIDEND' },
      { exDate: '2024-09-27', paymentDate: '2025-03-12', valuePerShare: '0.070058824', tipo: 'JCP' },
      { exDate: '2024-12-20', paymentDate: '2025-03-12', valuePerShare: '0.079764706', tipo: 'JCP' },
      { exDate: '2025-02-28', paymentDate: '2025-03-12', valuePerShare: '0.302652686', tipo: 'DIVIDEND' },
      { exDate: '2025-03-21', paymentDate: '2025-08-13', valuePerShare: '0.080705882', tipo: 'JCP' },
      { exDate: '2025-06-20', paymentDate: '2025-08-13', valuePerShare: '0.094058824', tipo: 'JCP' },
      { exDate: '2025-07-25', paymentDate: '2025-08-13', valuePerShare: '0.171450382', tipo: 'DIVIDEND' },
      { exDate: '2025-09-26', paymentDate: '2025-12-12', valuePerShare: '0.110235294', tipo: 'JCP' },
      { exDate: '2025-12-03', paymentDate: '2025-12-12', valuePerShare: '0.111294118', tipo: 'JCP' },
      { exDate: '2025-12-03', paymentDate: '2025-12-12', valuePerShare: '0.341700000', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'KLBN11',
    name: 'Klabin S.A.',
    quantidadeHoje: '444',
    eventos: [
      { date: '2024-05-06', tipo: 'SPLIT', ratio: '1.10', descricao: 'Bonificação de 10%' },
      { date: '2025-12-17', tipo: 'SPLIT', ratio: '1.01', descricao: 'Bonificação de 1%' },
    ],
    // O silêncio de 2020 é real: a Klabin pagou uma única vez em fevereiro e
    // só voltou a distribuir em outubro de 2021.
    proventos: [
      { exDate: '2020-02-10', paymentDate: '2020-02-20', valuePerShare: '0.021820899', tipo: 'DIVIDEND' },
      { exDate: '2021-10-29', paymentDate: '2021-11-11', valuePerShare: '0.273114038', tipo: 'DIVIDEND' },
      { exDate: '2021-10-29', paymentDate: '2021-11-11', valuePerShare: '0.092858773', tipo: 'JCP' },
      { exDate: '2022-02-14', paymentDate: '2022-02-25', valuePerShare: '0.343214590', tipo: 'DIVIDEND' },
      { exDate: '2022-05-06', paymentDate: '2022-05-18', valuePerShare: '0.314416822', tipo: 'DIVIDEND' },
      { exDate: '2022-08-01', paymentDate: '2022-08-11', valuePerShare: '0.362586075', tipo: 'DIVIDEND' },
      { exDate: '2022-10-31', paymentDate: '2022-11-14', valuePerShare: '0.255358374', tipo: 'DIVIDEND' },
      { exDate: '2022-10-31', paymentDate: '2022-11-14', valuePerShare: '0.200833455', tipo: 'JCP' },
      { exDate: '2022-12-20', paymentDate: '2023-02-22', valuePerShare: '0.032715198', tipo: 'JCP' },
      { exDate: '2023-02-13', paymentDate: '2023-02-24', valuePerShare: '0.313520646', tipo: 'DIVIDEND' },
      { exDate: '2023-05-05', paymentDate: '2023-05-16', valuePerShare: '0.352696703', tipo: 'DIVIDEND' },
      { exDate: '2023-08-04', paymentDate: '2023-08-15', valuePerShare: '0.243779985', tipo: 'DIVIDEND' },
      { exDate: '2023-10-27', paymentDate: '2023-11-14', valuePerShare: '0.289123415', tipo: 'JCP' },
      { exDate: '2023-12-21', paymentDate: '2024-02-26', valuePerShare: '0.154985700', tipo: 'JCP' },
      { exDate: '2024-02-15', paymentDate: '2024-02-26', valuePerShare: '0.174020849', tipo: 'DIVIDEND' },
      { exDate: '2024-05-03', paymentDate: '2024-05-16', valuePerShare: '0.298538154', tipo: 'DIVIDEND' },
      { exDate: '2024-08-05', paymentDate: '2024-08-15', valuePerShare: '0.337195480', tipo: 'DIVIDEND' },
      { exDate: '2024-11-11', paymentDate: '2024-11-21', valuePerShare: '0.349544127', tipo: 'JCP' },
      { exDate: '2024-12-16', paymentDate: '2025-03-12', valuePerShare: '0.212195515', tipo: 'JCP' },
      { exDate: '2025-03-05', paymentDate: '2025-03-14', valuePerShare: '0.044413179', tipo: 'DIVIDEND' },
      { exDate: '2025-05-13', paymentDate: '2025-05-22', valuePerShare: '0.228800506', tipo: 'DIVIDEND' },
      { exDate: '2025-08-08', paymentDate: '2025-08-19', valuePerShare: '0.250944616', tipo: 'DIVIDEND' },
      { exDate: '2025-11-07', paymentDate: '2025-11-19', valuePerShare: '0.260788703', tipo: 'DIVIDEND' },
      { exDate: '2025-12-15', paymentDate: '2026-02-27', valuePerShare: '0.227985861', tipo: 'DIVIDEND' },
      { exDate: '2025-12-15', paymentDate: '2026-05-20', valuePerShare: '0.227985861', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'GGBR3',
    name: 'Gerdau S.A.',
    quantidadeHoje: '252',
    eventos: [
      { date: '2023-03-21', tipo: 'SPLIT', ratio: '1.05', descricao: 'Bonificação de 5%' },
      { date: '2024-04-17', tipo: 'SPLIT', ratio: '1.20', descricao: 'Bonificação de 20%' },
    ],
    proventos: [
      { exDate: '2020-02-28', paymentDate: '2020-03-11', valuePerShare: '0.03', tipo: 'DIVIDEND' },
      { exDate: '2020-11-06', paymentDate: '2020-11-18', valuePerShare: '0.12', tipo: 'DIVIDEND' },
      { exDate: '2020-12-21', paymentDate: '2021-03-25', valuePerShare: '0.17', tipo: 'JCP' },
      { exDate: '2021-03-11', paymentDate: '2021-03-25', valuePerShare: '0.13', tipo: 'JCP' },
      { exDate: '2021-05-14', paymentDate: '2021-05-26', valuePerShare: '0.40', tipo: 'DIVIDEND' },
      { exDate: '2021-08-16', paymentDate: '2021-08-26', valuePerShare: '0.54', tipo: 'DIVIDEND' },
      { exDate: '2021-09-27', paymentDate: '2021-11-16', valuePerShare: '0.38', tipo: 'JCP' },
      { exDate: '2021-11-05', paymentDate: '2021-11-16', valuePerShare: '1.42', tipo: 'DIVIDEND' },
      { exDate: '2021-11-05', paymentDate: '2021-11-16', valuePerShare: '0.20', tipo: 'JCP' },
      { exDate: '2022-03-07', paymentDate: '2022-03-16', valuePerShare: '0.20', tipo: 'DIVIDEND' },
      { exDate: '2022-05-16', paymentDate: '2022-05-25', valuePerShare: '0.57', tipo: 'JCP' },
      { exDate: '2022-08-15', paymentDate: '2022-08-25', valuePerShare: '0.71', tipo: 'DIVIDEND' },
      { exDate: '2022-11-21', paymentDate: '2022-12-14', valuePerShare: '1.73', tipo: 'DIVIDEND' },
      { exDate: '2022-11-21', paymentDate: '2022-12-14', valuePerShare: '0.42', tipo: 'JCP' },
      { exDate: '2023-03-14', paymentDate: '2023-03-23', valuePerShare: '0.20', tipo: 'DIVIDEND' },
      { exDate: '2023-05-15', paymentDate: '2023-05-29', valuePerShare: '0.51', tipo: 'JCP' },
      { exDate: '2023-08-18', paymentDate: '2023-08-29', valuePerShare: '0.43', tipo: 'DIVIDEND' },
      { exDate: '2023-11-17', paymentDate: '2023-12-13', valuePerShare: '0.47', tipo: 'DIVIDEND' },
      { exDate: '2024-03-01', paymentDate: '2024-03-12', valuePerShare: '0.10', tipo: 'DIVIDEND' },
      { exDate: '2024-05-15', paymentDate: '2024-05-27', valuePerShare: '0.28', tipo: 'DIVIDEND' },
      { exDate: '2024-08-09', paymentDate: '2024-08-20', valuePerShare: '0.12', tipo: 'DIVIDEND' },
      { exDate: '2024-11-18', paymentDate: '2024-12-16', valuePerShare: '0.30', tipo: 'DIVIDEND' },
      { exDate: '2025-03-05', paymentDate: '2025-03-14', valuePerShare: '0.10', tipo: 'DIVIDEND' },
      { exDate: '2025-05-08', paymentDate: '2025-05-19', valuePerShare: '0.12', tipo: 'DIVIDEND' },
      { exDate: '2025-08-11', paymentDate: '2025-08-18', valuePerShare: '0.12', tipo: 'DIVIDEND' },
      { exDate: '2025-11-10', paymentDate: '2025-12-11', valuePerShare: '0.28', tipo: 'DIVIDEND' },
      { exDate: '2026-03-10', paymentDate: '2026-03-18', valuePerShare: '0.10', tipo: 'DIVIDEND' },
      { exDate: '2026-05-13', paymentDate: '2026-06-09', valuePerShare: '0.18', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'EGIE3',
    name: 'Engie Brasil Energia S.A.',
    quantidadeHoje: '140',
    eventos: [
      { date: '2025-12-01', tipo: 'SPLIT', ratio: '1.40', descricao: 'Bonificação de 40%' },
    ],
    proventos: [
      { exDate: '2020-08-07', paymentDate: '2021-01-29', valuePerShare: '0.830573', tipo: 'DIVIDEND' },
      { exDate: '2020-12-18', paymentDate: '2021-01-29', valuePerShare: '0.679560', tipo: 'DIVIDEND' },
      { exDate: '2020-12-18', paymentDate: '2021-04-05', valuePerShare: '0.214479', tipo: 'JCP' },
      { exDate: '2021-05-11', paymentDate: '2021-07-12', valuePerShare: '0.747117', tipo: 'DIVIDEND' },
      { exDate: '2021-08-16', paymentDate: '2021-11-29', valuePerShare: '0.967632', tipo: 'DIVIDEND' },
      { exDate: '2021-12-29', paymentDate: '2022-03-17', valuePerShare: '0.073535', tipo: 'JCP' },
      { exDate: '2022-02-24', paymentDate: '2022-03-17', valuePerShare: '0.782752', tipo: 'DIVIDEND' },
      { exDate: '2022-05-11', paymentDate: '2022-07-12', valuePerShare: '0.673831', tipo: 'DIVIDEND' },
      { exDate: '2022-08-16', paymentDate: '2022-12-16', valuePerShare: '0.708254', tipo: 'DIVIDEND' },
      { exDate: '2022-11-21', paymentDate: '2022-12-12', valuePerShare: '0.57948073', tipo: 'DIVIDEND' },
      { exDate: '2022-12-22', paymentDate: '2023-07-26', valuePerShare: '0.24511975', tipo: 'JCP' },
      { exDate: '2023-05-08', paymentDate: '2023-09-26', valuePerShare: '1.78344074', tipo: 'DIVIDEND' },
      { exDate: '2023-08-21', paymentDate: '2023-12-27', valuePerShare: '0.94027880', tipo: 'DIVIDEND' },
      { exDate: '2023-12-21', paymentDate: '2024-07-26', valuePerShare: '0.17771182', tipo: 'JCP' },
      { exDate: '2024-05-06', paymentDate: '2024-07-26', valuePerShare: '1.21880323', tipo: 'DIVIDEND' },
      { exDate: '2024-08-21', paymentDate: '2025-05-27', valuePerShare: '1.14324649', tipo: 'DIVIDEND' },
      { exDate: '2024-12-19', paymentDate: '2025-02-07', valuePerShare: '0.30639968', tipo: 'JCP' },
      { exDate: '2025-05-06', paymentDate: '2025-12-23', valuePerShare: '0.87648135', tipo: 'DIVIDEND' },
      { exDate: '2025-08-21', paymentDate: '2025-12-23', valuePerShare: '0.88143195', tipo: 'DIVIDEND' },
      { exDate: '2025-12-18', paymentDate: '2026-05-20', valuePerShare: '0.08754277', tipo: 'JCP' },
      { exDate: '2026-05-04', paymentDate: '2026-05-20', valuePerShare: '0.48828976', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'TAEE11',
    name: 'Transmissora Aliança de Energia Elétrica S.A.',
    quantidadeHoje: '100',
    eventos: [],
    proventos: [
      { exDate: '2020-05-06', paymentDate: '2020-05-15', valuePerShare: '0.179281', tipo: 'DIVIDEND' },
      { exDate: '2020-05-19', paymentDate: '2020-05-28', valuePerShare: '0.523780', tipo: 'DIVIDEND' },
      { exDate: '2020-05-19', paymentDate: '2020-05-28', valuePerShare: '0.177871', tipo: 'JCP' },
      { exDate: '2020-08-17', paymentDate: '2020-08-26', valuePerShare: '0.640182', tipo: 'DIVIDEND' },
      { exDate: '2020-08-17', paymentDate: '2020-08-26', valuePerShare: '0.170578', tipo: 'JCP' },
      { exDate: '2020-11-16', paymentDate: '2020-11-25', valuePerShare: '1.192375', tipo: 'DIVIDEND' },
      { exDate: '2020-11-16', paymentDate: '2020-11-25', valuePerShare: '0.169566', tipo: 'JCP' },
      { exDate: '2020-12-15', paymentDate: '2020-12-28', valuePerShare: '0.157382', tipo: 'JCP' },
      { exDate: '2021-05-04', paymentDate: '2021-05-27', valuePerShare: '1.631192', tipo: 'DIVIDEND' },
      { exDate: '2021-05-18', paymentDate: '2021-05-27', valuePerShare: '1.165672', tipo: 'DIVIDEND' },
      { exDate: '2021-05-18', paymentDate: '2021-05-27', valuePerShare: '0.188691', tipo: 'JCP' },
      { exDate: '2021-12-06', paymentDate: '2021-12-29', valuePerShare: '0.931743', tipo: 'DIVIDEND' },
      { exDate: '2021-12-06', paymentDate: '2021-12-29', valuePerShare: '0.586403', tipo: 'JCP' },
      { exDate: '2022-05-09', paymentDate: '2022-05-31', valuePerShare: '2.323063', tipo: 'DIVIDEND' },
      { exDate: '2022-08-15', paymentDate: '2022-08-26', valuePerShare: '0.896372', tipo: 'DIVIDEND' },
      { exDate: '2022-08-15', paymentDate: '2022-08-26', valuePerShare: '0.574557', tipo: 'JCP' },
      { exDate: '2022-11-14', paymentDate: '2022-12-05', valuePerShare: '0.329172', tipo: 'DIVIDEND' },
      { exDate: '2022-11-14', paymentDate: '2022-12-05', valuePerShare: '0.131087', tipo: 'DIVIDEND' },
      { exDate: '2022-11-14', paymentDate: '2022-12-05', valuePerShare: '0.600346', tipo: 'JCP' },
      { exDate: '2023-01-10', paymentDate: '2023-01-23', valuePerShare: '1.335273', tipo: 'DIVIDEND' },
      { exDate: '2023-05-03', paymentDate: '2023-08-29', valuePerShare: '0.075612', tipo: 'DIVIDEND' },
      { exDate: '2023-08-07', paymentDate: '2023-08-29', valuePerShare: '0.282127', tipo: 'DIVIDEND' },
      { exDate: '2023-08-07', paymentDate: '2023-08-29', valuePerShare: '0.627717', tipo: 'JCP' },
      { exDate: '2023-11-13', paymentDate: '2023-12-15', valuePerShare: '0.011830', tipo: 'DIVIDEND' },
      { exDate: '2023-11-13', paymentDate: '2023-12-15', valuePerShare: '0.581948', tipo: 'JCP' },
      { exDate: '2024-01-03', paymentDate: '2024-01-16', valuePerShare: '0.661840', tipo: 'DIVIDEND' },
      { exDate: '2024-05-03', paymentDate: '2024-05-16', valuePerShare: '1.132902', tipo: 'DIVIDEND' },
      { exDate: '2024-05-13', paymentDate: '2024-06-27', valuePerShare: '0.420591', tipo: 'JCP' },
      { exDate: '2024-08-15', paymentDate: '2024-11-27', valuePerShare: '0.305030', tipo: 'DIVIDEND' },
      { exDate: '2024-08-15', paymentDate: '2024-11-27', valuePerShare: '0.343095', tipo: 'JCP' },
      { exDate: '2024-11-11', paymentDate: '2025-01-29', valuePerShare: '0.26906310', tipo: 'DIVIDEND' },
      { exDate: '2024-11-11', paymentDate: '2025-01-29', valuePerShare: '0.39993549', tipo: 'JCP' },
      { exDate: '2025-04-29', paymentDate: '2025-05-28', valuePerShare: '0.55330131', tipo: 'DIVIDEND' },
      { exDate: '2025-04-29', paymentDate: '2025-11-27', valuePerShare: '0.32190459', tipo: 'DIVIDEND' },
      { exDate: '2025-05-12', paymentDate: '2025-08-27', valuePerShare: '0.54652245', tipo: 'JCP' },
      { exDate: '2025-08-18', paymentDate: '2025-11-27', valuePerShare: '0.23019206', tipo: 'DIVIDEND' },
      { exDate: '2025-08-18', paymentDate: '2025-11-27', valuePerShare: '0.63897936', tipo: 'JCP' },
      { exDate: '2025-11-14', paymentDate: '2026-01-28', valuePerShare: '0.51895321', tipo: 'DIVIDEND' },
      { exDate: '2025-11-14', paymentDate: '2026-01-28', valuePerShare: '0.41940723', tipo: 'JCP' },
      { exDate: '2026-04-29', paymentDate: '2026-05-27', valuePerShare: '0.75537414', tipo: 'DIVIDEND' },
      { exDate: '2026-04-29', paymentDate: '2026-05-27', valuePerShare: '0.15348615', tipo: 'DIVIDEND' },
    ],
  },
  {
    symbol: 'CMIN3',
    name: 'CSN Mineração S.A.',
    quantidadeHoje: '13',
    // A CMIN3 não existia em 01/01/2020: o IPO foi em 18/02/2021. A série
    // começa lá, e não há provento antes — inventar um seria dinheiro de uma
    // ação que ainda não era negociada.
    eventos: [],
    proventos: [
      { exDate: '2021-04-30', paymentDate: '2021-08-10', valuePerShare: '0.051581', tipo: 'DIVIDEND' },
      { exDate: '2021-07-30', paymentDate: '2021-08-10', valuePerShare: '0.330526', tipo: 'DIVIDEND' },
      { exDate: '2021-12-29', paymentDate: '2022-01-20', valuePerShare: '0.086308', tipo: 'JCP' },
      { exDate: '2022-04-29', paymentDate: '2022-05-19', valuePerShare: '0.459438', tipo: 'DIVIDEND' },
      { exDate: '2022-11-10', paymentDate: '2022-11-22', valuePerShare: '0.321402', tipo: 'DIVIDEND' },
      { exDate: '2022-11-10', paymentDate: '2022-11-22', valuePerShare: '0.124286', tipo: 'JCP' },
      { exDate: '2022-12-28', paymentDate: '2023-05-17', valuePerShare: '0.015993', tipo: 'JCP' },
      { exDate: '2023-04-28', paymentDate: '2023-05-17', valuePerShare: '0.115200', tipo: 'DIVIDEND' },
      { exDate: '2023-05-08', paymentDate: '2023-05-17', valuePerShare: '0.282571', tipo: 'DIVIDEND' },
      { exDate: '2023-05-08', paymentDate: '2023-05-17', valuePerShare: '0.050942', tipo: 'JCP' },
      { exDate: '2023-11-20', paymentDate: '2023-11-28', valuePerShare: '0.248842', tipo: 'DIVIDEND' },
      { exDate: '2023-12-28', paymentDate: '2024-05-28', valuePerShare: '0.079347', tipo: 'JCP' },
      { exDate: '2024-05-14', paymentDate: '2024-05-28', valuePerShare: '0.18686917', tipo: 'DIVIDEND' },
      { exDate: '2024-10-03', paymentDate: '2024-12-30', valuePerShare: '0.43722027', tipo: 'DIVIDEND' },
      { exDate: '2024-10-03', paymentDate: '2024-12-30', valuePerShare: '0.02945484', tipo: 'DIVIDEND' },
      { exDate: '2024-10-03', paymentDate: '2024-12-30', valuePerShare: '0.08560313', tipo: 'JCP' },
      { exDate: '2025-01-06', paymentDate: '2025-07-15', valuePerShare: '0.03895596', tipo: 'JCP' },
      { exDate: '2025-05-13', paymentDate: '2025-07-15', valuePerShare: '0.20066109', tipo: 'DIVIDEND' },
      { exDate: '2025-05-13', paymentDate: '2025-07-15', valuePerShare: '0.03865948', tipo: 'JCP' },
      { exDate: '2025-11-07', paymentDate: '2025-11-19', valuePerShare: '0.07809320', tipo: 'DIVIDEND' },
      { exDate: '2025-11-07', paymentDate: '2025-11-19', valuePerShare: '0.08818043', tipo: 'JCP' },
    ],
  },
  {
    symbol: 'BHIA3',
    name: 'Grupo Casas Bahia S.A.',
    quantidadeHoje: '40',
    // Em 2020 o papel era VVAR3: as 40 ações de hoje eram 1.000 antes do
    // grupamento de 25:1.
    eventos: [
      { date: '2023-12-15', tipo: 'REVERSE_SPLIT', ratio: '25', descricao: 'Grupamento 25:1' },
    ],
    // Nenhum provento desde 2018. A empresa deu prejuízo o período inteiro, e
    // uma linha zerada na tela de renda passiva é informação, não falha.
    proventos: [],
  },
]
