-- =========================================================================
-- Ori Shop Management Portal – Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- =========================================================================

-- ---------- profiles (extends auth.users) --------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text,
  role        text not null check (role in ('admin','storekeeper','cashier')) default 'cashier',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- categories ---------------------------------------------------
create table if not exists public.categories (
  id    uuid primary key default gen_random_uuid(),
  name  text unique not null
);

-- ---------- suppliers ----------------------------------------------------
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  contact_person  text,
  phone           text,
  viber           text,
  email           text,
  address         text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------- products -----------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  barcode         text,
  category        text,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  unit_type       text not null check (unit_type in ('piece','kg','tin','box','case')) default 'piece',
  pieces_per_case int not null default 1,
  purchase_price  numeric(12,2) not null default 0,
  selling_price   numeric(12,2) not null default 0,
  margin_pct      numeric(6,2)  not null default 20,
  boat_fee        numeric(12,2) not null default 0,
  other_cost      numeric(12,2) not null default 0,
  reorder_level   int not null default 0,
  expiry_date     date,
  photo_url       text,
  stock_pieces    int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists products_barcode_idx on public.products(barcode);

-- ---------- inventory_transactions --------------------------------------
create table if not exists public.inventory_transactions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products(id) on delete cascade,
  type        text check (type in ('in','out','adjust','damage','sale','receive')),
  qty         int not null,
  note        text,
  user_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- customers ----------------------------------------------------
create table if not exists public.customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone            text,
  address          text,
  opening_balance  numeric(12,2) not null default 0,
  credit_limit     numeric(12,2) not null default 0,
  balance          numeric(12,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);

-- Credit approval workflow (idempotent column adds for existing DBs)
alter table public.customers add column if not exists requested_credit_limit numeric(12,2) not null default 0;
alter table public.customers add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending','approved','rejected'));
alter table public.customers add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.customers add column if not exists approved_at timestamptz;

-- ---------- sales --------------------------------------------------------
create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  invoice_no      text unique,
  customer_id     uuid references public.customers(id) on delete set null,
  payment_method  text not null check (payment_method in ('cash','card','bank','credit')) default 'cash',
  total           numeric(12,2) not null default 0,
  profit          numeric(12,2) not null default 0,
  user_id         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid references public.sales(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  qty          int not null,
  unit_type    text,
  unit_price   numeric(12,2) not null default 0,
  landed_cost  numeric(12,2) not null default 0,
  line_total   numeric(12,2) not null default 0,
  line_profit  numeric(12,2) not null default 0
);

-- ---------- damaged_items ------------------------------------------------
create table if not exists public.damaged_items (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid references public.products(id) on delete set null,
  qty                   int not null,
  unit_type             text,
  reason                text,
  landed_cost_per_unit  numeric(12,2) not null default 0,
  loss_amount           numeric(12,2) not null default 0,
  stock_before          int,
  stock_after           int,
  user_id               uuid references public.profiles(id) on delete set null,
  date                  date not null default current_date,
  notes                 text,
  created_at            timestamptz not null default now()
);

-- ---------- orders + order_items ----------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid references public.suppliers(id) on delete set null,
  status          text not null check (status in ('pending','loaded','received','partial','cancelled')) default 'pending',
  boat_name       text,
  boat_contact    text,
  loading_date    date,
  sent_date       date,
  expected_date   date,
  received_date   date,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  qty           int not null,
  unit_type     text,
  received_qty  int not null default 0,
  notes         text
);

-- ---------- credit_transactions + payments ------------------------------
create table if not exists public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers(id) on delete cascade,
  type         text not null check (type in ('sale','payment','adjust')),
  amount       numeric(12,2) not null,
  sale_id      uuid references public.sales(id) on delete set null,
  note         text,
  user_id      uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid references public.customers(id) on delete cascade,
  amount         numeric(12,2) not null,
  method         text check (method in ('cash','card','bank')),
  note           text,
  user_id        uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

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

-- ---------- activity_logs -----------------------------------------------
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- Helper: is_admin() — used by RLS policies
-- =========================================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.has_role(roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = any(roles) and active = true
  );
$$;

-- =========================================================================
-- Auto-create a profile when a new auth user signs up
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'cashier',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.profiles              enable row level security;
alter table public.categories            enable row level security;
alter table public.suppliers             enable row level security;
alter table public.products              enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.customers             enable row level security;
alter table public.sales                 enable row level security;
alter table public.sale_items            enable row level security;
alter table public.damaged_items         enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.credit_transactions   enable row level security;
alter table public.payments              enable row level security;
alter table public.activity_logs         enable row level security;
alter table public.app_settings          enable row level security;
alter table public.dropdown_options      enable row level security;

-- Drop existing policies (idempotent re-runs)
do $$
declare r record;
begin
  for r in (select schemaname, tablename, policyname from pg_policies where schemaname='public') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

-- ---------- profiles -----------------------------------------------------
create policy "profiles read all auth"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles self insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles self update"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles admin all"
  on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- Generic helper: read-all for any authenticated user, write for staff
-- (admin + storekeeper + cashier where appropriate)
-- ---------- categories ---------------------------------------------------
create policy "cat read"   on public.categories for select using (auth.role() = 'authenticated');
create policy "cat write"  on public.categories for all
  using (public.has_role(array['admin','storekeeper'])) with check (public.has_role(array['admin','storekeeper']));

-- ---------- suppliers ----------------------------------------------------
create policy "sup read"  on public.suppliers for select using (auth.role() = 'authenticated');
create policy "sup write" on public.suppliers for all
  using (public.has_role(array['admin','storekeeper'])) with check (public.has_role(array['admin','storekeeper']));

-- ---------- products -----------------------------------------------------
create policy "prod read"  on public.products for select using (auth.role() = 'authenticated');
create policy "prod write" on public.products for all
  using (public.has_role(array['admin','storekeeper','cashier']))
  with check (public.has_role(array['admin','storekeeper','cashier']));

-- ---------- inventory_transactions ---------------------------------------
create policy "inv read"   on public.inventory_transactions for select using (auth.role() = 'authenticated');
create policy "inv write"  on public.inventory_transactions for all
  using (public.has_role(array['admin','storekeeper','cashier']))
  with check (public.has_role(array['admin','storekeeper','cashier']));

-- ---------- customers ----------------------------------------------------
create policy "cust read"  on public.customers for select using (auth.role() = 'authenticated');
create policy "cust write" on public.customers for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

-- ---------- sales + sale_items -------------------------------------------
create policy "sales read"  on public.sales for select using (auth.role() = 'authenticated');
create policy "sales write" on public.sales for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

create policy "si read"  on public.sale_items for select using (auth.role() = 'authenticated');
create policy "si write" on public.sale_items for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

-- ---------- damaged_items ------------------------------------------------
create policy "dmg read"  on public.damaged_items for select using (auth.role() = 'authenticated');
create policy "dmg write" on public.damaged_items for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

-- ---------- orders + order_items -----------------------------------------
create policy "ord read"  on public.orders for select using (auth.role() = 'authenticated');
create policy "ord write" on public.orders for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

create policy "oi read"  on public.order_items for select using (auth.role() = 'authenticated');
create policy "oi write" on public.order_items for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

-- ---------- credit_transactions + payments ------------------------------
create policy "ct read"  on public.credit_transactions for select using (auth.role() = 'authenticated');
create policy "ct write" on public.credit_transactions for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

create policy "pay read"  on public.payments for select using (auth.role() = 'authenticated');
create policy "pay write" on public.payments for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

-- ---------- activity_logs ------------------------------------------------
create policy "log read"   on public.activity_logs for select using (auth.role() = 'authenticated');
create policy "log insert" on public.activity_logs for insert
  with check (auth.role() = 'authenticated');

-- ---------- app_settings ------------------------------------------------
create policy "settings read" on public.app_settings for select
  using (auth.role() = 'authenticated');
create policy "settings write" on public.app_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- dropdown_options --------------------------------------------
create policy "dd read" on public.dropdown_options for select
  using (auth.role() = 'authenticated');
create policy "dd write" on public.dropdown_options for all
  using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- Purchase Orders / Buying Goods (controlled workflow)
-- See migrations/0004_purchase_orders.sql for the canonical version.
-- =========================================================================
alter table public.profiles
  add column if not exists is_purchasing_staff boolean not null default false;

create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_no           text unique,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  status          text not null default 'raised'
                  check (status in (
                    'draft','raised','assigned','buying_in_progress',
                    'waiting_approval','approved','loaded','receiving',
                    'completed','rejected'
                  )),
  notes           text,
  required_date   date,
  invoice_no      text,
  invoice_url     text,
  boat_name       text,
  loading_date    date,
  process_date    date,
  total_amount    numeric(12,2) not null default 0,
  raised_by       uuid references public.profiles(id) on delete set null,
  raised_at       timestamptz not null default now(),
  assigned_to     uuid references public.profiles(id) on delete set null,
  assigned_at     timestamptz,
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  po_id              uuid not null references public.purchase_orders(id) on delete cascade,
  product_id         uuid references public.products(id) on delete set null,
  product_name       text not null,
  expected_qty       numeric(12,2) not null default 0,
  unit_type          text not null default 'piece',
  pieces_per_case    int not null default 1,
  buying_qty         numeric(12,2) not null default 0,
  buying_price_case  numeric(12,2) not null default 0,
  buying_price_piece numeric(12,2) not null default 0,
  total_amount       numeric(12,2) not null default 0,
  received_qty       int not null default 0,
  damaged_qty        int not null default 0,
  missing_qty        int not null default 0,
  expiry_date        date,
  batch_no           text,
  status             text not null default 'pending'
                     check (status in (
                       'pending','buying_entered','waiting_approval',
                       'loaded','received','needs_correction',
                       'approved','completed'
                     )),
  correction_note    text,
  notes              text,
  created_at         timestamptz not null default now()
);

alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

-- =========================================================================
-- Bootstrap your first admin
-- =========================================================================
-- 1) In Supabase Dashboard → Authentication → Users → Add user
--    Create a user with your email + password (and *disable* email confirmation
--    in Authentication → Providers → Email if you want instant access).
-- 2) Then promote that user to admin by running:
--      update public.profiles set role = 'admin' where email = 'you@example.com';
