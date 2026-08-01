> **Status: concluída.** 38 testes passando (44 com o banco conectado).

# 05 — Fase 3: dados reais

A interface parou de ler `src/mocks/`. Agora tudo vem do banco, passando pelo
RLS. As telas não mudaram de aparência — mudou de onde vêm os números.

## Como rodar

```bash
npm run db:seed     # agora popula também cotações e snapshots
npm run dev
```

O seed ficou maior porque a Fase 3 precisa de duas coisas que antes eram
geradas no cliente:

- **Cotações** (`quote`). Sem elas o dashboard mostraria lucro zero em tudo: a
  posição sabe o preço médio pago, mas o valor de mercado vem desta tabela.
- **Snapshots** (`portfolio_snapshot`), 241 dias. O gráfico de evolução agora
  **lê de tabela**. O job diário da Fase 4 só continua a série.

## O caminho de um número até a tela

```
transaction (ledger)
   └─ computePosition()          ← preço médio, custo, lucro realizado
        └─ position.*            ← cache, reconstruível
             └─ loadPositions()  ← + quote + valuation, dentro de withRls
                  └─ consolidateBy{Class,Wallet,Instrument}()
                       └─ toPortfolioView()   ← Decimal vira string formatada
                            └─ componente     ← só renderiza e anima
```

Nenhuma etapa foi pulada, e o cliente não soma dinheiro em lugar nenhum.

## Decisões

### De onde sai o preço atual

| Modo | Origem | Se faltar |
|---|---|---|
| `QUANTITATIVE` | última linha de `quote` | usa o preço médio |
| `VALUATED` | última `valuation` | tenta `quote`, depois o preço médio |
| `ACCRUAL` | última `valuation` | idem |

O fallback para o preço de compra é deliberado: sem cotação, o ativo aparece
valendo o que custou — lucro zero — em vez de sumir do patrimônio ou zerar o
total. **Errar para o lado conservador é melhor do que inventar valor.** E a
tela avisa quais ativos estão nessa situação, porque silenciar seria mentir por
omissão sobre o número mais importante da página.

### Gravar transação, nunca posição

`createPosition` insere um `BUY` e chama `recomputePosition`. Em nenhum momento
a Server Action decide qual é a quantidade ou o preço médio — quem responde isso
é o motor de ledger. Carteira, instrumento, posição, lançamento e recálculo
acontecem na mesma transação: falha no meio não pode deixar uma posição sem a
compra que a originou.

### Histórico por recorte vem do `breakdown`

A coluna `portfolio_snapshot.breakdown` guarda o valor por classe e por
carteira. É o que permite o gráfico de uma carteira específica existir. Sem ela,
essa curva teria que ser inventada a partir do total.

No seed, o breakdown é distribuído pela composição de **hoje** — uma
aproximação assumida, porque a composição real de seis meses atrás nunca foi
gravada. O job diário da Fase 4 grava a verdadeira.

### Tipos de view fora do módulo de consulta

`core/view/class-workspace-view.ts` existe porque o build quebrou de verdade:
componentes de cliente importavam `OVERVIEW_SCOPE` do módulo de consulta, e isso
arrastava Drizzle e o driver do Postgres para o bundle do browser. Tipo que
atravessa a fronteira servidor→cliente mora em módulo sem efeito colateral.

## Testes

```
14  motor de ledger        custo médio, venda parcial, split, bonificação,
                           transferência sem lucro fantasma, JCP líquido
24  seed → ledger          cada ativo da demonstração reconstruído a partir
                           das transações; totais de 1.422.189 / 1.104.797 /
                           61.380; BTC consolidado a 183.837,21
 6  isolamento entre       exigem DIRECT_URL; provam que o Postgres recusa
    tenants                leitura e escrita cruzada
```

## O que ainda não existe

- **Cotação automática.** Preço só entra por seed ou manualmente no formulário.
  Fase 4.
- **Snapshot diário automático.** A série não avança sozinha. Fase 4.
- **Venda, transferência e proventos pela interface.** O motor já sabe tratar os
  seis tipos; falta a tela. O formulário de hoje só lança compra.
- **Histórico e Renda passiva.** Continuam como estado vazio.
