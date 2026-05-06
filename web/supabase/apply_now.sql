-- =========================================================================
-- ORI SHOP — APPLY NOW (combined migrations 0001-0006)
-- Paste this entire file into Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotent: safe to re-run any time.
-- =========================================================================

-- =========================================================================
-- 0001 — app_settings and dropdown_options tables
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
-- =========================================================================
-- Credit Customer Public Link + RPC
-- =========================================================================

-- 1. Columns ---------------------------------------------------------------
alter table public.customers
  add column if not exists public_token uuid not null default gen_random_uuid();

alter table public.customers
  add column if not exists last_payment_at timestamptz;

create unique index if not exists customers_public_token_key
  on public.customers(public_token);

-- Backfill missing tokens (in case of older rows).
update public.customers
   set public_token = gen_random_uuid()
 where public_token is null;

-- Keep last_payment_at fresh from credit_transactions (best-effort backfill).
update public.customers c
   set last_payment_at = sub.last_at
  from (
    select customer_id, max(created_at) as last_at
      from public.credit_transactions
     where type = 'payment'
     group by customer_id
  ) sub
 where sub.customer_id = c.id
   and (c.last_payment_at is null or c.last_payment_at < sub.last_at);

-- 2. Public RPC ------------------------------------------------------------
-- Returns the customer's credit account + full transaction history (with
-- item lines and cashier name) for a given secure token. SECURITY DEFINER
-- bypasses RLS so anonymous customers can fetch only their own data.
create or replace function public.get_credit_account(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  select case when c.id is null then null else jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'address', c.address,
      'balance', c.balance,
      'credit_limit', c.credit_limit,
      'opening_balance', c.opening_balance,
      'last_payment_at', c.last_payment_at,
      'created_at', c.created_at
    ),
    'transactions', coalesce((
      select jsonb_agg(t_obj order by created_at desc)
      from (
        select
          t.created_at,
          jsonb_build_object(
            'id', t.id,
            'type', t.type,
            'amount', t.amount,
            'note', t.note,
            'sale_id', t.sale_id,
            'cashier', p.full_name,
            'payment_method', s.payment_method,
            'created_at', t.created_at,
            'items', case
              when t.sale_id is not null then (
                select jsonb_agg(jsonb_build_object(
                  'name', coalesce(pr.name, '(item)'),
                  'qty',  si.qty,
                  'unit', si.unit_type,
                  'price', si.unit_price,
                  'total', si.line_total
                ))
                from sale_items si
                left join products pr on pr.id = si.product_id
                where si.sale_id = t.sale_id
              )
              else null
            end
          ) as t_obj
        from credit_transactions t
        left join profiles p on p.id = t.user_id
        left join sales    s on s.id = t.sale_id
        where t.customer_id = c.id
      ) sub
    ), '[]'::jsonb)
  ) end
  into result
  from customers c
  where c.public_token = p_token
  limit 1;

  return result;
end;
$$;

grant execute on function public.get_credit_account(uuid) to anon, authenticated;
-- =========================================================================
-- Stock Batches + Expiry Tracking
-- Each stock-in creates a batch row; sales/damage consume FIFO by expiry.
-- =========================================================================

create table if not exists public.stock_batches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  batch_no          text,
  qty_pieces        int  not null default 0,
  remaining_pieces  int  not null default 0,
  purchase_date     date not null default current_date,
  expiry_date       date,
  user_id           uuid references public.profiles(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists stock_batches_product_idx
  on public.stock_batches(product_id);
create index if not exists stock_batches_expiry_idx
  on public.stock_batches(product_id, expiry_date nulls last, created_at);

alter table public.stock_batches enable row level security;

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public' and tablename = 'stock_batches'
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

create policy "batch read"  on public.stock_batches for select
  using (auth.role() = 'authenticated');
create policy "batch write" on public.stock_batches for all
  using (public.has_role(array['admin','storekeeper','cashier']))
  with check (public.has_role(array['admin','storekeeper','cashier']));
-- =========================================================================
-- Purchase Orders / Buying Goods Workflow
-- Controlled, multi-step PO flow with item-by-item approval and
-- inventory updates only after admin/storekeeper sign-off.
-- =========================================================================

-- Mark profiles that may attend purchasing duty (assigned by admin).
alter table public.profiles
  add column if not exists is_purchasing_staff boolean not null default false;

-- ---------- purchase_orders ---------------------------------------------
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

create index if not exists purchase_orders_status_idx on public.purchase_orders(status);
create index if not exists purchase_orders_assigned_idx on public.purchase_orders(assigned_to);

-- Auto PO number generator: PO-YYYY-NNNN per year
create or replace function public.gen_po_no()
returns trigger
language plpgsql
as $$
declare
  yr text := to_char(now(), 'YYYY');
  nxt int;
begin
  if new.po_no is not null and new.po_no <> '' then
    return new;
  end if;
  select coalesce(max(
    (regexp_replace(po_no, '^PO-' || yr || '-', ''))::int
  ), 0) + 1
  into nxt
  from public.purchase_orders
  where po_no like 'PO-' || yr || '-%';
  new.po_no := 'PO-' || yr || '-' || lpad(nxt::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_gen_po_no on public.purchase_orders;
create trigger trg_gen_po_no
  before insert on public.purchase_orders
  for each row execute function public.gen_po_no();

-- ---------- purchase_order_items ----------------------------------------
create table if not exists public.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  po_id             uuid not null references public.purchase_orders(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,
  expected_qty      numeric(12,2) not null default 0,
  unit_type         text not null default 'piece',
  pieces_per_case   int not null default 1,
  buying_qty        numeric(12,2) not null default 0,
  buying_price_case numeric(12,2) not null default 0,
  buying_price_piece numeric(12,2) not null default 0,
  total_amount      numeric(12,2) not null default 0,
  received_qty      int not null default 0,
  damaged_qty       int not null default 0,
  missing_qty       int not null default 0,
  expiry_date       date,
  batch_no          text,
  status            text not null default 'pending'
                    check (status in (
                      'pending','buying_entered','waiting_approval',
                      'loaded','received','needs_correction',
                      'approved','completed'
                    )),
  correction_note   text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists po_items_po_idx on public.purchase_order_items(po_id);

-- ---------- RLS ---------------------------------------------------------
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('purchase_orders','purchase_order_items')
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

-- Read: any authenticated user (cashier UI hides sensitive fields)
create policy "po read" on public.purchase_orders for select
  using (auth.role() = 'authenticated');
create policy "poi read" on public.purchase_order_items for select
  using (auth.role() = 'authenticated');

-- Write: admin + storekeeper (workflow gating happens in app code)
create policy "po write" on public.purchase_orders for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));
create policy "poi write" on public.purchase_order_items for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));
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
-- =========================================================================
-- Purchase Orders: Auto-draft generation + storekeeper-edited workflow
-- Adds new statuses (auto_draft, storekeeper_edited) and transport/estimated
-- value fields for shipment-value estimates.
-- =========================================================================

-- Drop existing status check, re-create with extended set
alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in (
    'auto_draft','storekeeper_edited',
    'draft','raised','assigned','buying_in_progress',
    'waiting_approval','approved','loaded','receiving',
    'completed','rejected'
  ));

-- New columns for shipment value estimation
alter table public.purchase_orders
  add column if not exists transport_fee numeric(12,2) not null default 0;

alter table public.purchase_orders
  add column if not exists estimated_total numeric(12,2) not null default 0;
