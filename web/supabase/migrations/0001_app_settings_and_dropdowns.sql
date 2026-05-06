-- =========================================================================
-- Fix: missing app_settings and dropdown_options tables
-- Paste this into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
-- =========================================================================

-- ---------- app_settings (key/value JSON store) -------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- dropdown_options (admin-managed dropdown lists) -------------
create table if not exists public.dropdown_options (
  id          uuid primary key default gen_random_uuid(),
  group_key   text not null,
  label       text not null,
  value       text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists dropdown_options_group_idx
  on public.dropdown_options(group_key, sort_order);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.app_settings     enable row level security;
alter table public.dropdown_options enable row level security;

-- Drop existing policies for these two tables only (idempotent re-runs)
do $$
declare r record;
begin
  for r in (
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('app_settings','dropdown_options')
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

create policy "settings read" on public.app_settings for select
  using (auth.role() = 'authenticated');
create policy "settings write" on public.app_settings for all
  using (public.is_admin()) with check (public.is_admin());

create policy "dd read" on public.dropdown_options for select
  using (auth.role() = 'authenticated');
create policy "dd write" on public.dropdown_options for all
  using (public.is_admin()) with check (public.is_admin());
