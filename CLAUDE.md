# Portfolio Tracker — Regras Permanentes do Projeto

Leia este arquivo antes de qualquer alteração. Ele tem precedência sobre
conveniência, pressa ou preferência pessoal.

Documentação completa em `docs/`:
- `00-visao-e-melhorias.md` — o que é o produto e por que as decisões foram tomadas
- `01-arquitetura.md` — camadas, modelo de dados, motor de domínio
- `02-design-system.md` — identidade visual, tokens, movimento
- `03-estrutura-do-projeto.md` — pastas, regras de organização, roadmap

---

## 1. Escopo — o limite inegociável

Este sistema é um **gestor de patrimônio**. Não é um sistema financeiro e não é
um controle de despesas.

**Nunca implementar, em nenhuma fase:** cartão de crédito, contas a pagar,
contas a receber, orçamento mensal, parcelamentos, financiamentos, consórcios,
controle de despesas, fluxo de caixa doméstico.

**Teste antes de aceitar qualquer feature:** *isto descreve um bem que o usuário
possui, ou um comportamento de consumo dele?* Comportamento de consumo está fora.

"Empréstimos a juros" entra porque o usuário é o **credor** — é um recebível,
parte do patrimônio. O lado devedor nunca é modelado.

---

## 2. Regras técnicas

1. **O ledger é a fonte da verdade.** Quantidade e preço médio são sempre
   derivados de transações. Nenhum código escreve posição diretamente.
   Colunas derivadas em `position` são cache — reconstruíveis a qualquer momento.

2. **`float` nunca toca dinheiro.** `numeric` no Postgres, `Decimal` na
   aplicação. Só `core/money/decimal.ts` importa `decimal.js`.

3. **Toda tabela de negócio tem `tenant_id`, e o RLS está ligado.** Isolamento em
   duas camadas independentes. Nunca confiar em `tenant_id` vindo do cliente.
   Hoje é um usuário por tenant (sem `membership`), mas o `tenant_id` continua
   em todo lugar — é ele que preserva o caminho para o multiusuário.

4. **`core/` é TypeScript puro.** Sem React, sem ORM, sem `fetch`. Se precisa de
   I/O, está na camada errada.

5. **Cálculo no servidor.** O cliente renderiza e anima; não calcula patrimônio.

6. **Só `transform` e `opacity` animam.** Nunca `width`, `height`, `top`, `left`
   ou `box-shadow` em keyframes.

7. **Nenhum hexadecimal em componente.** Se a cor não está em
   `styles/tokens.css`, ela não existe no produto.

8. **Um schema Zod por entidade**, compartilhado entre formulário e Server
   Action. Validação nunca é duplicada.

9. **Nada é apagado de verdade — exceto o que nunca foi patrimônio.**
   Soft delete e trilha de auditoria em tudo que representa patrimônio: uma
   posição vendida é fato econômico e permanece no histórico.

   A exceção é a exclusão explícita pelo usuário. Erro de digitação não é
   patrimônio, é entulho, e guardá-lo não audita nada — só polui. `deletePosition`
   apaga de verdade, com cascade, e refaz o snapshot do dia.

   O snapshot é o motivo de a exclusão precisar de cuidado: ele NÃO se
   recalcula sozinho. Qualquer caminho que remova ou corrija patrimônio de forma
   retroativa tem que refazer a foto do dia, senão o erro fica no gráfico de
   evolução para sempre.

10. **Jobs e importações são idempotentes.** Chave de idempotência obrigatória.

11. **Feature desligada é feature invisível.** Flags em `config/features.ts`.
    Modelo e cálculo podem existir; a interface não aparece pela metade.

---

## 3. Regras de UI

- Tema escuro é o padrão e, por ora, o único.
- Neon só em resposta ao usuário — hover, foco, dado ativo. Nunca em repouso.
- No máximo um elemento brilhando por região visual.
- Glassmorphism só em superfícies que flutuam (header, modal, tooltip, dropdown).
  Cards do dashboard não usam glass.
- Verde e vermelho são semânticos (alta/baixa). Nunca decorativos.
- Números sempre com `tabular-nums`.
- `prefers-reduced-motion` é respeitado. Sempre.
- Respiro generoso: 24px dentro do card, 20px entre cards, 48px entre seções.

---

## 4. Como trabalhar neste projeto

- **Uma fase por vez.** Não avançar antes dos critérios de pronto da fase atual.
- Todo PR que toca `core/` exige teste.
- Se a mesma lógica aparece duas vezes, ela pertence ao domínio, não à tela.
- Arquivo passando de ~200 linhas é sinal de extração faltando.
- Diante de ambiguidade sobre escopo, aplicar o teste da seção 1 e, se ainda
  restar dúvida, perguntar antes de construir.
