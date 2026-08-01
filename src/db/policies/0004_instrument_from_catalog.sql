-- ---------------------------------------------------------------------------
--  Instrumento global criado pelo usuário — só se estiver no catálogo
--
--  A policy original só permitia ao usuário criar instrumento PRIVADO; linha
--  global era exclusividade do job com service_role. Isso quebrou no momento em
--  que o formulário passou a aceitar qualquer ticker: cadastrar KLBN11 tentava
--  criar um instrumento global e a policy recusava.
--
--  A saída não é liberar geral. O `instrument` é COMPARTILHADO entre tenants —
--  é isso que faz a cotação do PETR4 ser buscada uma vez e servir todo mundo. Se
--  qualquer usuário pudesse inserir qualquer símbolo global, o primeiro a
--  cadastrar "PETR4" com o nome errado estragaria a tela de todos os outros.
--
--  O catálogo resolve isso sendo a lista branca: símbolo que veio da B3, da
--  CoinGecko ou da Twelve Data é fato de mercado, não digitação. O que não está
--  no catálogo continua sendo criado como instrumento privado do tenant, onde
--  um erro de digitação não afeta ninguém além de quem digitou.
-- ---------------------------------------------------------------------------
drop policy if exists instrument_catalog_insert on public.instrument;

create policy instrument_catalog_insert
  on public.instrument
  for insert
  to authenticated
  with check (
    is_global = true
    and tenant_id is null
    and exists (
      select 1
      from public.ticker_catalog c
      where c.symbol = instrument.symbol
    )
  );
