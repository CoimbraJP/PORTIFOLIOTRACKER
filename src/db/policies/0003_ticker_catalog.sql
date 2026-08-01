-- ---------------------------------------------------------------------------
--  ticker_catalog — dado de mercado, global
--
--  Mesma regra de `quote`, `fx_rate` e `corporate_action`: a lista de papéis da
--  B3 é a mesma para todo mundo, então leitura liberada a qualquer usuário
--  autenticado e escrita só pelo job, que usa a service role.
--
--  O RLS fica LIGADO mesmo com a leitura liberada. Sem `enable`, a tabela
--  simplesmente não participa do modelo, e um erro futuro de permissão passaria
--  despercebido. Com `force`, nem o dono da tabela escapa da policy.
-- ---------------------------------------------------------------------------
alter table public.ticker_catalog enable row level security;
alter table public.ticker_catalog force row level security;

drop policy if exists ticker_catalog_read on public.ticker_catalog;

create policy ticker_catalog_read
  on public.ticker_catalog
  for select
  to authenticated
  using (true);
