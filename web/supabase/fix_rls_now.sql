-- =========================================================================
-- fix_rls_now.sql
--
-- Run this in Supabase → SQL Editor if INSERT / UPDATE from the app are
-- silently failing. It re-creates permissive RLS policies for every app
-- table so any *authenticated* user can read & write. Admin-only tables
-- (role_settings, app_settings, dropdown_options) keep their stricter
-- write policy via public.is_admin().
--
-- Safe to re-run. Idempotent.
-- =========================================================================

-- Make sure is_admin() exists (some old DBs are missing it).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Helper: apply standard "authenticated read+write" policies to a table.
do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'suppliers',
    'products',
    'customers',
    'credit_transactions',
    'sales',
    'sale_items',
    'orders',
    'order_items',
    'damaged_items',
    'activity_logs',
    'inventory_transactions',
    'stock_batches',
    'purchase_orders',
    'purchase_order_items',
    'consignment_owners',
    'consignment_items',
    'consignment_sales',
    'consignment_returns',
    'consignment_settlements',
    'cash_drawer_sessions',
    'cash_drawer_movements',
    'quotations',
    'quotation_items'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security;', t);
      execute format('drop policy if exists "%s read"  on public.%I;', t, t);
      execute format('drop policy if exists "%s write" on public.%I;', t, t);
      execute format(
        'create policy "%s read" on public.%I for select using (auth.role() = ''authenticated'');',
        t, t
      );
      execute format(
        'create policy "%s write" on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
        t, t
      );
    end if;
  end loop;
end$$;

-- Sanity: list policies so you can confirm they exist.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
