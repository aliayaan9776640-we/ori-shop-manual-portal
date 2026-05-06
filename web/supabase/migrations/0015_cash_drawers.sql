-- =========================================================================
-- 0015_cash_drawers.sql
-- Permanent End-of-Day cash drawer records.
-- Cashier opens a drawer, POS sales accumulate against it, cashier closes
-- with denomination count and notes, admin reviews / approves.
-- All historic drawer sessions are kept here as the source of truth.
-- Idempotent — safe to re-run.
-- =========================================================================

create table if not exists public.cash_drawers (
  id              text primary key,
  cashier_id      uuid references public.profiles(id) on delete set null,
  cashier_name    text,
  status          text not null default 'open'
                  check (status in ('open','closed','approved')),

  opening_cash    numeric(12,2) not null default 0,
  cash_sales      numeric(12,2) not null default 0,
  card_sales      numeric(12,2) not null default 0,
  bank_sales      numeric(12,2) not null default 0,
  credit_sales    numeric(12,2) not null default 0,
  total_sales     numeric(12,2) not null default 0,
  change_given    numeric(12,2) not null default 0,
  cash_used       numeric(12,2) not null default 0,
  expected_cash   numeric(12,2) not null default 0,
  counted_cash    numeric(12,2) not null default 0,
  difference      numeric(12,2) not null default 0,

  denominations   jsonb not null default '[]'::jsonb,
  notes           text,
  admin_notes     text,

  approved_by     uuid references public.profiles(id) on delete set null,
  approved_by_name text,
  approved_at     timestamptz,

  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cash_drawers_cashier_idx
  on public.cash_drawers (cashier_id, opened_at desc);
create index if not exists cash_drawers_status_idx
  on public.cash_drawers (status);
create index if not exists cash_drawers_opened_at_idx
  on public.cash_drawers (opened_at desc);

-- Auto-update updated_at on every change.
create or replace function public.cash_drawers_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cash_drawers_touch on public.cash_drawers;
create trigger cash_drawers_touch
  before update on public.cash_drawers
  for each row execute function public.cash_drawers_touch();

alter table public.cash_drawers enable row level security;

-- Drop any pre-existing policies so the migration is rerunnable.
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

-- Read: any authenticated user (UI further restricts cashier to their own).
create policy "cd read"
  on public.cash_drawers for select
  using (auth.role() = 'authenticated');

-- Insert: cashier opening their own drawer, or admin.
create policy "cd insert"
  on public.cash_drawers for insert
  with check (
    auth.role() = 'authenticated'
    and (
      cashier_id = auth.uid()
      or public.is_admin()
    )
  );

-- Update: cashier may update their own OPEN drawer (closing it),
-- admin may update any drawer (approve / corrections).
create policy "cd update"
  on public.cash_drawers for update
  using (
    public.is_admin()
    or (cashier_id = auth.uid())
  )
  with check (
    public.is_admin()
    or (cashier_id = auth.uid())
  );

-- Delete: admin only.
create policy "cd delete"
  on public.cash_drawers for delete
  using (public.is_admin());
