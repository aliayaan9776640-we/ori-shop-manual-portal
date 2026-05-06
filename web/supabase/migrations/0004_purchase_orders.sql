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
