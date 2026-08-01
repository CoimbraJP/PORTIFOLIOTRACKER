> **Status: concluída.** 59 testes passando (65 com o banco conectado).

# 07 — Moeda de exibição e logos personalizados

## Antes de usar

A tabela de override de logo é nova:

```bash
npm run db:push
npm run db:policies
```

Sem isso, Configurações quebra ao tentar listar os logos.

## Moeda base

**BRL-first.** O ledger e todo o cálculo vivem na moeda base. A conversão é só
de exibição — nunca reescreve lançamento.

Configurações → Moeda base tem duas partes:

1. **Moeda do patrimônio** — BRL ou USD. É onde tudo soma.
2. **Exibir em {a outra moeda}** — um interruptor por classe, das 12.

O interruptor por classe existe porque a régua muda com a estratégia: cripto e
stocks quase sempre são cotados em dólar, quem tem imóvel no exterior pensa
naquele bem em dólar, e um FII brasileiro nunca deixa de ser real. Uma opção
única não daria conta.

Trocar a moeda base inverte o sentido dos interruptores: com base em real eles
ligam o dólar; com base em dólar, ligam o real. As classes marcadas continuam
sendo a exceção, seja qual for a base.

O verde do interruptor é uma exceção consciente à regra de que verde e vermelho
são semânticos (alta e baixa). Aqui verde não fala de dinheiro, fala de
"ligado" — e o ciano competiria com foco e hover, que já são ciano.

### A regra que mantém os números honestos

**Escopo homogêneo converte. Escopo que mistura classes, não.**

Uma classe é homogênea: todos os ativos dela compartilham a mesma moeda de
exibição, então o total dela em dólar é inequívoco. Uma carteira também, porque
pertence a uma classe só. O patrimônio geral, não — ele soma classes diferentes.

Com a base em BRL e Criptomoedas ligada em USD:

```
PATRIMÔNIO TOTAL              R$ 1.422.189,00   ← mistura classes: fica em BRL

Criptomoedas                    US$ 54.198,71   ← classe homogênea: vai em USD
  0,43 BTC   PM US$ 33.847,52   US$ 30.478,74
  2,6  ETH   PM US$  2.122,88   US$  9.285,72

Ações Brasil                    R$ 132.628,00   ← outra classe, outra moeda
```

A página inteira de Criptomoedas — cabeçalho, cartões, gráficos, carteiras e
tabela — aparece em dólar. Só o patrimônio geral resiste, porque somar USD com
BRL daria um número sem significado.

O gráfico de distribuição usa `baseValue`, um campo separado sempre em moeda
base: se a geometria da fatia usasse o valor exibido, misturar BRL e USD
deformaria as proporções do anel.

### O que a conversão responde, e o que não responde

A conversão usa o câmbio de hoje, **tanto no valor quanto no custo**. Como os
dois mudam na mesma proporção, a **rentabilidade percentual continua idêntica
nas duas moedas** — e há um teste garantindo isso.

Isso responde corretamente: *"quanto meu patrimônio vale em dólares hoje"*.

Isso **não** responde: *"qual foi minha rentabilidade em dólares"*. Um BTC
comprado com dólar a R$ 5,00 e avaliado com dólar a R$ 6,00 rendeu menos em
dólar do que em real. Para essa pergunta seria preciso converter cada compra
pela taxa da data dela — o campo `transaction.fx_rate` existe para isso, mas
hoje está gravado como 1 em tudo, porque todo lançamento foi feito em reais.

### Sem câmbio sincronizado

`convertMoney` devolve o valor original. O número aparece na moeda errada, mas
nenhum patrimônio é multiplicado por um palpite. Inventar uma taxa seria pior
do que exibir sem converter.

## Logos personalizados

Configurações → Logos dos ativos lista tudo que existe, mostrando o que a
CoinGecko e a BRAPI encontraram. O campo aceita uma URL; o botão de voltar
restaura o automático.

### Por que uma tabela separada

`instrument` é **global** — o BTC é o mesmo registro para todos os tenants.
Escrever o logo direto lá mudaria a tela de todo mundo, que é exatamente o que
não se quer. Então existe `instrument_logo_override`, com `tenant_id` e RLS:
cada conta vê e altera só o seu.

Restaurar o padrão é um `DELETE`, não um campo extra de estado — a ausência de
linha já significa "use o automático".

## Onde cada preferência mora

| Preferência | Onde | Por quê |
|---|---|---|
| Moeda base | coluna `tenant.base_currency` | governa o cálculo inteiro |
| Cripto em USD | `tenant.settings` (jsonb) | é só apresentação, não muda somatório |
| Logo | tabela própria com RLS | precisa de FK e de isolamento por tenant |

Preferências de apresentação tendem a se multiplicar; cada uma virar coluna
seria uma migration por capricho.

## Testes novos

```
14  conversão e moeda por classe
      ida e volta preserva o valor
      sem câmbio não inventa taxa; taxa zero não divide por zero
      cada classe é independente — ligar cripto não afeta ações nem imóveis
      imóvel no exterior em USD com cripto em BRL: a régua é por classe
      base USD com uma classe em BRL inverte o caso corretamente
      rentabilidade percentual idêntica nas duas moedas
      o patrimônio total ignora os overrides, com quantas classes ligadas houver
```
