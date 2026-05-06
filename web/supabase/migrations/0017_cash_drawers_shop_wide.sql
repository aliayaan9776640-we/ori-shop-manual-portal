-- =========================================================================
-- 0017_cash_drawers_shop_wide.sql
-- Shop-wide single open drawer:
--   * Only ONE drawer may have status='open' at any time across the shop.
--   * Any cashier may open (if none open) and any cashier may close.
--   * Track who opened and who closed (may be different).
--   * Optional close_reason when closed by a different cashier.
-- Idempotent — safe to re-run.
-- =========================================================================

alter table public.cash_drawers
  add column if not exists opened_by      uuid references public.profiles(id) on delete set null,
  add column if not exists opened_by_name text,
  add column if not exists closed_by      uuid references public.profiles(id) on delete set null,
  add column if not exists closed_by_name text,
  add column if not exists close_reason   text;

-- Backfill opened_by from cashier_id where missing (legacy rows).
update public.cash_drawers
   set opened_by = cashier_id,
       opened_by_name = coalesce(opened_by_name, cashier_name)
 where opened_by is null
   and cashier_id is not null;

-- Enforce only one open drawer at a time across the whole shop.
-- Partial unique index on a constant expression for status='open'.
drop index if exists cash_drawers_single_open_idx;
create unique index cash_drawers_single_open_idx
  on public.cash_drawers ((1))
  where status = 'open';

-- Refresh RLS policies: any authenticated user may open / close the
-- shared shop drawer; admins retain full control.
do $$
declare r record;
begin
  for r in (
    select policyname from pg_policies
    where schemaname='public' and tablename='cash_drawers'
  ) loop
    execute format('drop policy if exists %I on public.cash_drawers', r.policyname);
  end loop;
end$$;

create policy "cd read"
  on public.cash_drawers for select
  using (auth.role() = 'authenticated');

-- Insert: any authenticated user may open a shared drawer for the shop.
create policy "cd insert"
  on public.cash_drawers for insert
  with check (auth.role() = 'authenticated');

-- Update: any authenticated user may update an open drawer (close it /
-- accumulate change/cash used). Closed/approved rows are admin-only.
create policy "cd update"
  on public.cash_drawers for update
  using (
    public.is_admin()
    or status = 'open'
  )
  with check (
    public.is_admin()
    or status in ('open','closed')
  );

create policy "cd delete"
  on public.cash_drawers for delete
  using (public.is_admin());

-- Enable realtime so all sessions see open/close changes immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'cash_drawers'
  ) then
    execute 'alter publication supabase_realtime add table public.cash_drawers';
  end if;
exception when others then
  -- Publication may not exist in non-Supabase environments — ignore.
  null;
end$$;
