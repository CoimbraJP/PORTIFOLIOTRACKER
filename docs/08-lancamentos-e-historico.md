> **Status: concluída.** 69 testes passando (75 com o banco conectado).

# 08 — Lançamentos completos e Histórico

Antes disto o sistema só sabia registrar compra. Agora o ledger é gravável por
inteiro pela interface.

## O que dá para lançar

Clique no **+** de qualquer ativo — na tabela da classe ou dentro de uma
carteira. Um diálogo só, com o tipo como seletor.

| Tipo | O que faz no ledger |
|---|---|
| Compra | Soma quantidade e custo. Taxas entram no custo |
| Venda | Realiza lucro contra o preço médio; **não altera o preço médio** |
| Transferência | Move quantidade e custo entre carteiras. Nunca gera lucro |
| Dividendo · JCP | Acumula renda, líquida de IR. Não toca quantidade |
| Aluguel · Juros · Staking | Idem, com o rótulo da classe |
| Reavaliação | **Não passa pelo ledger** — vai para `valuation` |

Os tipos oferecidos dependem da classe. Imóvel não mostra "quantidade", cripto
não mostra dividendo, e só bem avaliado aceita reavaliação. Oferecer opção
impossível é convidar ao erro.

## Decisões

### O custo da transferência é calculado, nunca digitado

A Server Action lê o preço médio da posição de origem e move
`preçoMédio × quantidade` de custo junto com a quantidade. As duas pernas
compartilham um `transfer_group_id`.

Se o usuário pudesse digitar esse valor — ou se a saída fosse tratada como
venda e a entrada como compra a preço de mercado — apareceria **lucro
fantasma**: mandar 0,4 BTC da Binance para a Ledger registraria um ganho que
nunca existiu. É o erro clássico de quem usa cripto, e o motivo de o tipo
`TRANSFER` existir separado no domínio desde a Fase 1.

### O `+` do ativo consolidado decide sozinho, mas não adivinha

Com o ativo numa carteira só, lança direto. Com o ativo espalhado, **expande**
em vez de escolher — lançar na carteira errada em silêncio seria pior do que
pedir mais um clique.

### Reavaliação não é transação

Vai para a tabela `valuation`. O ledger registra fatos econômicos: reavaliação
é opinião de valor numa data, não movimento de dinheiro. Por isso ela também
não dispara recálculo de posição.

### Filtros do Histórico moram na URL

`/historico?classe=cripto&group=income&de=2025-01-01`

Sobrevive ao recarregar, pode ser compartilhado por link e o botão voltar
desfaz — três coisas que `useState` não dá. Os filtros de classe, carteira e
período vão no SQL; só a busca por texto é local, porque já opera sobre o
resultado.

### Cores no Histórico

Verde e vermelho marcam **entrada e saída de caixa**, não alta e baixa.
Transferência fica neutra de propósito: não move dinheiro, só de lugar.

## Testes novos

```
6  fluxo de lançamentos
     preço médio inclui taxa da compra e sobrevive à venda
     venda realiza lucro sem mexer no preço médio do que restou
     proventos acumulam líquidos de IR e não tocam a posição
     transferir move custo proporcional e não gera lucro dos dois lados
     consolidado das duas carteiras equivale a nunca ter transferido
     venda total zera posição e custo, preservando o lucro realizado
```

Os testes do motor cobrem cada tipo isolado; estes cobrem a **sequência**, que
é onde os efeitos se combinam e um erro de ordem apareceria.

## O que ainda falta

- **Editar e excluir lançamento.** Hoje só inclusão. O `deleted_at` já existe
  no schema, então é trabalho de interface e de revalidação.
- **Proventos automáticos.** Continua sendo a Fase 5 original, e depende do
  token da BRAPI para valer em ações e FIIs.
- **Renda passiva.** A tela segue como estado vazio, embora os dados já estejam
  no ledger — dá para construir a qualquer momento.
- **Importação de CSV.** Ninguém digita 200 operações.
