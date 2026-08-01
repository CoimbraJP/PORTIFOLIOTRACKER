# 00 — Visão do Produto e Melhorias Propostas

> Documento de arquitetura. Leia antes de escrever qualquer linha de código.
> Status: **proposta para aprovação** — nada foi implementado ainda.

---

## 1. O que este produto é

Um **gerenciador de patrimônio** multitenant. O usuário cadastra tudo que representa
patrimônio, em qualquer classe de ativo, e o sistema responde a uma pergunta em
menos de cinco segundos:

> "Quanto eu tenho, onde está, e como evoluiu?"

## 2. O que este produto **não** é

Regra permanente e inegociável. Nenhuma destas funcionalidades pode entrar no
sistema, em nenhuma fase, sob nenhum pretexto:

- Cartão de crédito
- Contas a pagar / a receber
- Orçamento mensal
- Parcelamentos, financiamentos, consórcios
- Controle de despesas
- Fluxo de caixa doméstico

**Teste de escopo:** antes de aceitar qualquer feature nova, pergunte *"isto
descreve um bem que o usuário possui, ou um comportamento de consumo dele?"*.
Se for comportamento de consumo, está fora.

> Nota sobre "Empréstimos a juros": é um ativo porque o usuário é o **credor** —
> o dinheiro emprestado é um **recebível**, parte do patrimônio dele. Nunca
> modelar o lado devedor. Se o usuário deve, isso é dívida pessoal e está fora.

---

## 3. Análise crítica do conceito original

O modelo `Classes → Carteiras → Ativos` está correto e é o coração do produto.
Mas, do jeito descrito, ele tem sete lacunas que causariam retrabalho pesado
mais adiante. Cada uma abaixo vem com a correção proposta.

### 3.1 ⚠️ "Preço médio" como campo cadastrável quebra o sistema

**Problema:** o brief lista "Quantidade" e "Preço médio" como campos do ativo em
Criptomoedas. Se preço médio é um campo digitado, então: o histórico de compras
não bate com a posição; o lucro realizado numa venda parcial é impossível de
calcular; um desdobramento de ações exige o usuário recalcular tudo na mão; e o
motor de dividendos não consegue saber quanto o usuário tinha na data-com.

**Correção — Ledger como fonte única da verdade.**
O usuário nunca edita quantidade nem preço médio. Ele lança **transações**
(compra, venda, transferência, provento, aporte, reavaliação). A posição é
sempre **derivada**:

```
posição = f(transações)
quantidade   = Σ entradas − Σ saídas
custo total  = Σ (qtd × preço) das entradas restantes
preço médio  = custo total ÷ quantidade
```

Isso resolve de graça: consolidação entre carteiras, lucro realizado vs. não
realizado, ajuste por desdobramento, auditoria, e a base para os proventos
automáticos. É a decisão arquitetural mais importante deste documento.

> Para não piorar a UX: a tela de cadastro continua parecendo simples. O
> formulário "adicionar ativo" cria, por baixo, a primeira transação de compra.
> O usuário não precisa saber que existe um ledger.

### 3.2 ⚠️ Falta a distinção entre **Instrumento** e **Posição**

**Problema:** "BTC" na Binance e "BTC" na Ledger são o mesmo ativo do mundo real,
mas duas posições diferentes. Se o ticker for texto livre dentro da posição, a
consolidação vira comparação de string — e `BTC`, `btc` e `Bitcoin` viram três
ativos distintos.

**Correção:** um catálogo global de **Instrumentos** (`instrument`), compartilhado
por todos os tenants, com ticker canônico, nome, moeda, e IDs externos
(`coingecko_id`, ticker B3, ISIN). A **Posição** (`position`) aponta para o
instrumento e pertence a uma carteira. Consolidar BTC = agrupar posições pelo
mesmo `instrument_id`. Bônus: uma cotação buscada serve todos os tenants → uma
chamada de API em vez de mil.

### 3.3 ⚠️ Nem todo ativo é quantitativo

**Problema:** ações e cripto têm quantidade × preço. Um imóvel não. Uma empresa
não. Um empréstimo não. Forçar tudo no mesmo formato ou cria campos vazios, ou
cria três sistemas paralelos.

**Correção:** dois **modos de valoração** no mesmo modelo:

| Modo | Como o valor atual é obtido | Classes |
|---|---|---|
| `QUANTITATIVE` | quantidade × cotação de mercado | Ações, Stocks, FIIs, ETFs, Cripto |
| `VALUATED` | última reavaliação manual registrada | Imóveis, Empresas, Alternativos |
| `ACCRUAL` | principal + juros acumulados até hoje | Renda Fixa, Empréstimos |

Mesma tabela, mesmo ledger, três estratégias de cálculo plugáveis. A classe
declara seu modo; o motor de avaliação escolhe a estratégia.

### 3.4 ⚠️ Campos por classe não podem virar uma tabela por classe

**Problema:** o brief pede campos diferentes por classe (imóvel tem área e
cidade; cripto tem rede e exchange) **e** pede que o usuário possa criar classes
novas no futuro. Uma tabela por classe torna "criar classe nova" uma migration
de banco — inviável num SaaS.

**Correção:** `asset_class` guarda um **schema de campos** declarativo (JSONB), e
o instrumento/posição guarda os valores em JSONB validado. Um único componente
de formulário renderiza qualquer classe a partir do schema. Criar a classe
"Obras de Arte" com campos "artista / ano / autenticidade" passa a ser um insert,
não um deploy.

### 3.5 ⚠️ Gráfico de evolução patrimonial precisa de snapshots desde o dia 1

**Problema — e não é performance.** Com um único usuário, calcular ao vivo seria
rápido o bastante. O problema real é **falta de dado**: para reconstruir o
patrimônio de uma terça-feira de três meses atrás, você precisa da cotação de
todos os seus ativos naquele dia. Cotação histórica de ação e cripto até dá para
buscar (com custo e limites). Mas **imóvel, empresa e investimento alternativo
não têm série histórica** — o valor deles só existe porque alguém registrou.

E há um detalhe irreversível: **o histórico que você não gravar hoje está
perdido para sempre.** Se os snapshots entrarem só na hora de escalar, o gráfico
de evolução vai nascer vazio, sem os meses de teste.

**Correção:** tabela `portfolio_snapshot`, um registro por dia, gravada desde a
primeira fase com dados reais. O job tem ~30 linhas e roda em milissegundos para
um usuário. O custo de manter é próximo de zero; o custo de não ter é permanente.

**Sobre frequência:** diário no fechamento, não de hora em hora. Patrimônio não é
day trade — 24 pontos por dia poluem o gráfico e multiplicam as linhas por 24 sem
acrescentar informação. O ponto de "hoje" no gráfico é calculado ao vivo, com as
cotações atuais; o histórico vem dos snapshots. Se mais tarde você quiser zoom
intradiário em cripto, isso vira uma tabela separada, sem mexer nesta.

### 3.6 ⚠️ Multi-moeda é estrutural, não um detalhe

**Problema:** o usuário tem BBAS3 em BRL, AAPL em USD e BTC em USD. Se o câmbio
não for capturado, a rentabilidade fica errada e não há como saber se o ganho
veio do ativo ou do dólar.

**Correção:** toda transação guarda **moeda original + valor + taxa de câmbio na
data**. O tenant tem uma **moeda base** (BRL). Todo agregado é convertido para a
moeda base. O dashboard pode, depois, mostrar "quanto do meu ganho foi câmbio".

### 3.7 ⚠️ "Rentabilidade" precisa de uma definição explícita

**Problema:** rentabilidade simples (`valor atual / investido − 1`) mente quando
há aportes ao longo do tempo. Dois usuários com o mesmo desempenho, mas aportes
em datas diferentes, aparecem com números muito distintos.

**Correção:** calcular e exibir três métricas, com rótulos honestos:

- **Lucro** — `valor atual + proventos recebidos − custo` (número absoluto, R$)
- **Variação** — `lucro / custo` (a "rentabilidade" simples, familiar ao usuário)
- **Rentabilidade real (TWR / XIRR)** — imune a aportes, para comparar com CDI e
  IBOV. Fase posterior, mas o ledger já nasce preparado.
  **Fica atrás de um toggle em Configurações, desligado por padrão.** É a métrica
  correta, mas exige repertório para interpretar; quem não conhece estranha ver
  dois números de rentabilidade diferentes na mesma tela.

Além disso: **Yield on Cost** = proventos dos últimos 12 meses ÷ custo de
aquisição. É o número que diferencia este produto.

---

## 4. Melhorias adicionais recomendadas

Não estavam no brief, mas mudam muito a percepção de qualidade:

1. **Transferência entre carteiras não é venda.** Mover BTC da Binance para a
   Ledger é uma operação de duas pernas (`TRANSFER_OUT` + `TRANSFER_IN`) que
   preserva o preço médio e **não** gera lucro. Sem isso, todo usuário de cripto
   vai ver lucro fantasma. Precisa existir desde a v1.

2. **Import via CSV.** Ninguém digita 200 operações. Um importador de notas de
   corretagem / extratos CSV com mapeamento de colunas é o que decide se o
   usuário adota ou abandona o produto. Fase 6.

3. **Soft delete + trilha de auditoria.** Toda transação tem `created_at`,
   `updated_at`, `deleted_at`. Patrimônio é dado sensível; nada é apagado de
   verdade.

4. **Idempotência nas importações e nos jobs.** Chave natural
   (`tenant + carteira + ativo + data + tipo + valor`) para nunca duplicar um
   provento buscado duas vezes.

5. **Metas e alocação-alvo.** "Quero 30% em cripto, estou em 41%." Um card de
   rebalanceamento é barato de construir sobre o modelo proposto.
   **Decisão:** o modelo de dados e o cálculo nascem prontos, mas a feature fica
   atrás da flag `features.allocationTargets = false` — invisível ao usuário até
   a Fase 7. Nada de UI meio-pronta exposta.

6. **Modo privacidade (blur nos valores).** Um atalho que borra todos os números.
   Detalhe pequeno, altíssimo impacto percebido — o usuário abre o app em público.

7. **Cotações em cache com TTL por classe.** Cripto: 60s. Ações: 15min durante o
   pregão, 12h fora. Imóveis: nunca. Protege o rate limit das APIs gratuitas e
   deixa o dashboard instantâneo.

---

## 5. Riscos conhecidos, declarados agora

Estes pontos são honestamente incertos. Melhor saber antes de construir.

| Risco | Impacto | Mitigação |
|---|---|---|
| **Cobertura de eventos corporativos da BRAPI** é parcial e o plano gratuito é limitado. Bonificações, grupamentos e desdobramentos históricos são especialmente irregulares. | Alto — o módulo de proventos automáticos é a feature de maior valor | Provider abstrato com fallback manual: o usuário sempre pode editar/adicionar um provento. Nunca prometer 100% automático na UI. |
| **Yahoo Finance não tem API oficial**; bibliotecas não oficiais quebram sem aviso. | Médio — afeta Stocks e ETFs internacionais | Interface `PriceProvider` com múltiplas implementações e degradação graciosa para último preço conhecido. |
| **Desdobramento retroativo** exige reprocessar o preço médio e todos os proventos posteriores. | Médio | Ledger + recálculo idempotente resolvem, mas o job precisa ser reexecutável com segurança. |
| **Rate limits das APIs gratuitas** não sustentam muitos tenants. | Alto no crescimento | Catálogo global de instrumentos + cache compartilhado: o custo de cotação cresce com o número de *ativos distintos*, não de usuários. |
| **Precisão numérica** — `float` corrompe dinheiro. | Crítico | `numeric` no Postgres, `Decimal` na aplicação. Nunca `number` do JS para valores monetários. Regra de lint. |

---

## 6. Decisões travadas (confirmadas com o usuário)

- **Stack:** Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage, RLS)
- **Fontes de dados:** BRAPI (B3), CoinGecko (cripto), Yahoo/Alpha Vantage (int.)
- **Design:** identidade visual definida no doc `02-design-system.md`
- **Primeira entrega de código:** Fundação + Design System + Dashboard

---

## 7. Princípios de desenvolvimento

1. **Um módulo por vez.** Nenhuma fase começa antes da anterior estar sólida.
2. **O ledger é sagrado.** Nada escreve posição diretamente. Sempre via transação.
3. **Server-first.** Cálculo de patrimônio acontece no servidor. O cliente
   renderiza, anima e interage — não calcula dinheiro.
4. **Toda query filtra por tenant.** E o banco reforça isso via RLS,
   independentemente do que a aplicação fizer.
5. **Nada de duplicação.** Se a mesma lógica aparece duas vezes, ela pertence ao
   domínio, não à tela.
