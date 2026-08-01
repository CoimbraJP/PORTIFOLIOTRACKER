-- ===========================================================================
--  RLS do override de logo.
--
--  Sem isto, a tabela nasceria aberta: qualquer autenticado leria e escreveria
--  o logo de qualquer tenant. Idempotente, como todo arquivo desta pasta.
-- ===========================================================================

alter table public.instrument_logo_override enable row level security;
alter table public.instrument_logo_override force row level security;

drop policy if exists instrument_logo_override_tenant_isolation
  on public.instrument_logo_override;

create policy instrument_logo_override_tenant_isolation
  on public.instrument_logo_override
  for all to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

grant select, insert, update, delete
  on public.instrument_logo_override to authenticated;
