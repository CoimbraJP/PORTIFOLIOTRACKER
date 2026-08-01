> **Status: concluída.** 49 testes passando (55 com o banco conectado).

# 06 — Fase 4: cotações, câmbio e juros

## Cotação e snapshot são coisas diferentes

Vale deixar claro, porque a confusão é natural:

| | O que é | Com que frequência |
|---|---|---|
| **`quote`** | O preço atual de um ativo | A cada sincronização — minutos, se quiser |
| **`portfolio_snapshot`** | Uma foto do patrimônio total naquele dia | Uma vez por dia |

O patrimônio na tela **não** é atualizado uma vez por dia. Ele é recalculado a
cada carregamento, sempre com a cotação mais recente que existir no banco. O que
acontece uma vez por dia é a gravação de mais um ponto no gráfico de evolução —
o histórico, não o valor de agora.

Por isso "Cotar agora" e "Gravar foto de hoje" são dois botões separados em
Configurações. Cotar é barato e pode ser repetido à vontade; gravar snapshot
mexe no histórico, e juntar os dois faria você reescrever o ponto do dia sem
querer.

## Fontes

| Classe | Provider | Precisa de chave |
|---|---|---|
| Criptomoedas | CoinGecko | não |
| Ações BR, FIIs, ETFs | BRAPI | **sim** — `BRAPI_TOKEN` |
| Câmbio USD/BRL | AwesomeAPI | não |
| Imóveis, empresas, empréstimos | — | não têm cotação de mercado |

Sem `BRAPI_TOKEN`, o provider se declara indisponível e some do registry. Os
ativos brasileiros ficam com preço manual, a tela avisa, e nada quebra. Colocar
a variável depois liga tudo sem tocar em código.

## Decisões

### Falha de um provider não derruba os outros

Se a BRAPI cair, cripto ainda atualiza. Um erro vira uma linha no relatório, não
uma exceção — a alternativa seria o usuário apertar "Cotar agora" e não ver
nada acontecer.

### Sempre em lote, com timeout de 8s

Um instrumento por requisição estoura o rate limit de qualquer API gratuita na
primeira dezena de ativos. E sem timeout, uma API lenta trava o job inteiro —
que roda com o usuário esperando quando ele aperta o botão.

### O id da CoinGecko não é o ticker

A API é indexada por id (`bitcoin`), não por símbolo. Ticker de cripto colide:
existe mais de uma moeda chamada "ONDO". Adivinhar o id devolveria o preço da
moeda errada **em silêncio** — o pior tipo de bug num sistema de patrimônio. Por
isso o id vive em `instrument.external_ids`, com um mapa de fallback só para os
casos conhecidos.

### Câmbio usa o `bid`, não o `ask`

Para converter um ativo em dólar para reais, o que interessa é quanto você
receberia **vendendo** aquele dólar. Usar o `ask` inflaria o patrimônio pelo
spread — que é exatamente o erro que faz o número não bater com a corretora.

### Juros compostos e proporcionais aos dias

`estimateAccrued` usa `principal × (1 + taxa) ^ (dias / diasDoPeríodo)`.

Composto porque é como CDB e empréstimo funcionam: em 2 anos a 1% a.m., juros
simples erram por mais de 6%. Proporcional aos dias porque um contrato iniciado
dia 20 não pode pular de zero para um mês inteiro de juros na virada.

O nome é `estimateAccrued`, não `calculate`, e isso é deliberado: CDI e IPCA
variam dia a dia e exigiriam a série histórica do índice. Para eles, a taxa
informada é uma estimativa efetiva.

### O botão e o cron rodam o mesmo código

`syncNow()` chama `syncQuotesJob()`, o mesmo do endpoint agendado. Se o botão
tivesse uma versão própria, os dois caminhos divergiriam com o tempo e o
resultado dependeria de como você atualizou.

### Segredo comparado em tempo constante

`/api/jobs/*` compara com `timingSafeEqual`. Comparar segredo com `===` vaza o
tamanho do prefixo correto pelo tempo de resposta.

## Agendamento, no deploy

Hoje o gatilho é o botão. Em produção, adicione ao `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/jobs/sync-quotes", "schedule": "*/15 9-18 * * 1-5" },
    { "path": "/api/jobs/sync-fx", "schedule": "0 * * * *" },
    { "path": "/api/jobs/daily-snapshot", "schedule": "50 23 * * *" }
  ]
}
```

O Vercel Cron envia `Authorization: Bearer $CRON_SECRET`; aponte essa variável
para o mesmo valor de `JOBS_SECRET`.

## ⚠️ O que não pôde ser verificado

**Nenhum provider foi testado contra a API real.** O ambiente onde escrevi não
alcança `api.coingecko.com`, `brapi.dev` nem `economia.awesomeapi.com.br` — as
tentativas voltaram vazias. Os formatos de resposta vieram da documentação
oficial da CoinGecko, não de uma chamada de verdade.

Na prática: **a primeira execução do "Cotar agora" é o primeiro teste real.** O
código foi escrito para falhar de forma visível — cada erro aparece nomeado no
painel, com o provider e a mensagem — justamente porque eu não pude validar
antes. Se algum campo tiver nome diferente do documentado, o sintoma vai ser
"0 cotações atualizadas" com o ativo listado em "sem cotação", não uma tela
quebrada.

## Testes

```
11  juros acumulados   composto vs simples, proporção diária, taxa a.a.,
                       campos ausentes não inventam rendimento
14  motor de ledger
24  seed → ledger
 6  isolamento entre tenants (exigem DIRECT_URL)
```

Os providers não têm teste automatizado: testar contra API externa real deixaria
a suíte dependente de rede e de rate limit alheio. O caminho honesto seria
gravar respostas reais como fixtures — o que exige, primeiro, conseguir fazer
uma chamada real.
