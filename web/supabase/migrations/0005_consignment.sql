-- =========================================================================
-- Consignment / Supplier-Owned Items module
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Idempotent: safe to re-run.
-- =========================================================================

-- ---------- consignment_owners ------------------------------------------
create table if not exists public.consignment_owners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  address         text,
  payment_method  text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------- consignment_items -------------------------------------------
-- One row per intake batch from an owner. Quantities are tracked in pieces.
create table if not exists public.consignment_items (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.consignment_owners(id) on delete cascade,
  name              text not null,
  unit_type         text not null default 'piece'
                    check (unit_type in ('piece','kg','tin','box','case','packet')),
  qty_received      numeric(12,3) not null default 0,
  qty_sold          numeric(12,3) not null default 0,
  qty_returned      numeric(12,3) not null default 0,
  selling_price     numeric(12,2) not null default 0,
  owner_payout      numeric(12,2) not null default 0,
  commission_pct    numeric(6,2)  not null default 0,
  received_date     date not null default current_date,
  notes             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists consignment_items_owner_idx
  on public.consignment_items(owner_id);

-- ---------- consignment_sales -------------------------------------------
create table if not exists public.consignment_sales (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.consignment_items(id) on delete cascade,
  owner_id        uuid not null references public.consignment_owners(id) on delete cascade,
  qty             numeric(12,3) not null,
  unit_price      numeric(12,2) not null,
  owner_payout    numeric(12,2) not null,
  total_amount    numeric(12,2) not null,
  payable_amount  numeric(12,2) not null,
  commission      numeric(12,2) not null,
  customer_id     uuid references public.customers(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists consignment_sales_owner_idx
  on public.consignment_sales(owner_id);
create index if not exists consignment_sales_item_idx
  on public.consignment_sales(item_id);

-- ---------- consignment_returns -----------------------------------------
create table if not exists public.consignment_returns (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.consignment_items(id) on delete cascade,
  owner_id     uuid not null references public.consignment_owners(id) on delete cascade,
  qty          numeric(12,3) not null,
  notes        text,
  user_id      uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------- consignment_settlements -------------------------------------
create table if not exists public.consignment_settlements (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.consignment_owners(id) on delete cascade,
  amount          numeric(12,2) not null,
  payment_method  text,
  period_from     date,
  period_to       date,
  paid_at         timestamptz not null default now(),
  notes           text,
  user_id         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists consignment_settlements_owner_idx
  on public.consignment_settlements(owner_id);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.consignment_owners       enable row level security;
alter table public.consignment_items        enable row level security;
alter table public.consignment_sales        enable row level security;
alter table public.consignment_returns      enable row level security;
alter table public.consignment_settlements  enable row level security;

do $$
declare r record;
begin
  for r in (
    select policyname, tablename from pg_policies
    where schemaname='public' and tablename in (
      'consignment_owners','consignment_items','consignment_sales',
      'consignment_returns','consignment_settlements'
    )
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Owners: admin manages, all staff can read
create policy "co read"  on public.consignment_owners for select using (auth.role() = 'authenticated');
create policy "co write" on public.consignment_owners for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

-- Items: admin + storekeeper can manage; all staff read
create policy "ci read"  on public.consignment_items for select using (auth.role() = 'authenticated');
create policy "ci write" on public.consignment_items for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

-- Sales: admin + cashier can sell; everyone reads
create policy "cs read"  on public.consignment_sales for select using (auth.role() = 'authenticated');
create policy "cs write" on public.consignment_sales for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

-- Returns: admin + storekeeper
create policy "cr read"  on public.consignment_returns for select using (auth.role() = 'authenticated');
create policy "cr write" on public.consignment_returns for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

-- Settlements: ADMIN ONLY can write; everyone reads
create policy "cset read"  on public.consignment_settlements for select using (auth.role() = 'authenticated');
create policy "cset write" on public.consignment_settlements for all
  using (public.is_admin()) with check (public.is_admin());
