-- ===========================================================================
--  Row Level Security — a segunda camada de isolamento.
--
--  A aplicação já filtra por tenant_id em toda query. Isto aqui existe para o
--  dia em que ela falhar: o banco recusa a linha independentemente do que o
--  código pedir. Ver docs/01 §3 e CLAUDE.md §2.3.
--
--  Idempotente: pode rodar quantas vezes for preciso.
-- ===========================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------------
--  Quem é o tenant da requisição
--
--  SECURITY DEFINER porque a própria tabela `tenant` tem RLS: sem isso a
--  função não conseguiria ler a linha que ela precisa para decidir o acesso —
--  recursão infinita de permissão.
--  STABLE permite ao planner avaliar uma vez por query em vez de por linha.
-- ---------------------------------------------------------------------------
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.tenant where owner_user_id = auth.uid()
$$;

revoke all on function app.current_tenant_id() from public;
grant execute on function app.current_tenant_id() to authenticated, service_role;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
--  Tabelas de tenant
--
--  FORCE é essencial: sem ele o DONO da tabela ignora as policies, e a conexão
--  do Drizzle roda como dono. Com FORCE, só papéis com BYPASSRLS (o `postgres`
--  usado pelo seed e pelas migrations) passam direto.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'asset_class', 'wallet', 'position', 'transaction',
    'valuation', 'portfolio_snapshot', 'attachment'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_isolation', t);
  end loop;
end $$;

-- `asset_class` é a exceção: tenant_id NULO significa classe de sistema,
-- visível a todos e editável por ninguém pela aplicação.
create policy asset_class_tenant_isolation on public.asset_class
  for select to authenticated
  using (tenant_id is null or tenant_id = app.current_tenant_id());

create policy asset_class_tenant_write on public.asset_class
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy wallet_tenant_isolation on public.wallet
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy position_tenant_isolation on public.position
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy transaction_tenant_isolation on public.transaction
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy valuation_tenant_isolation on public.valuation
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy portfolio_snapshot_tenant_isolation on public.portfolio_snapshot
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy attachment_tenant_isolation on public.attachment
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
--  A própria tabela tenant
-- ---------------------------------------------------------------------------
alter table public.tenant enable row level security;
alter table public.tenant force row level security;

drop policy if exists tenant_owner_read on public.tenant;
create policy tenant_owner_read on public.tenant
  for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists tenant_owner_update on public.tenant;
create policy tenant_owner_update on public.tenant
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- INSERT fica de fora de propósito: quem cria tenant é o trigger de signup.
-- Se a aplicação pudesse inserir, um usuário criaria tenants para si à vontade.

-- ---------------------------------------------------------------------------
--  Instrumento — catálogo misto
--
--  Linha global é leitura pública para autenticados (o BTC é o mesmo para
--  todos). Linha privada — imóvel, empresa, contrato — pertence ao tenant.
--  Escrita em linha global só pelo job, com service_role.
-- ---------------------------------------------------------------------------
alter table public.instrument enable row level security;
alter table public.instrument force row level security;

drop policy if exists instrument_read on public.instrument;
create policy instrument_read on public.instrument
  for select to authenticated
  using (is_global = true or tenant_id = app.current_tenant_id());

drop policy if exists instrument_private_write on public.instrument;
create policy instrument_private_write on public.instrument
  for all to authenticated
  using (is_global = false and tenant_id = app.current_tenant_id())
  with check (is_global = false and tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
--  Dados de mercado — globais, leitura para todos os autenticados
--
--  Sem tenant_id: cotação e evento corporativo são fato público. Escrita só
--  pelos jobs, que usam service_role.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['quote', 'fx_rate', 'corporate_action'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  Criação do tenant no primeiro login
--
--  No banco, e não na aplicação: assim vale para qualquer caminho de entrada
--  (OAuth, convite, admin) e não existe janela em que o usuário está
--  autenticado mas sem tenant.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant (owner_user_id, name, base_currency)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'usuario'), '@', 1)
    ),
    'BRL'
  )
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
--  Permissões de tabela
--
--  RLS decide QUAIS linhas. GRANT decide se o papel pode tocar na tabela.
--  As duas coisas precisam estar certas.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
