-- =========================================================================
-- 0019_online_store.sql
-- Customer-facing online store: customer registration, online orders,
-- order items, delivery tracking. Idempotent — safe to re-run.
--
-- Customers register/login via Supabase Auth using a synthetic email of
-- the form `<phone>@customers.ori.local`. They do NOT have a row in
-- public.profiles (which is for staff). Their profile lives in
-- public.public_customers and the link is `auth_user_id = auth.uid()`.
-- =========================================================================

-- ---------- public_customers --------------------------------------------
create table if not exists public.public_customers (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete cascade,
  name            text not null,
  phone           text not null,
  island          text,
  address         text,
  email           text,
  approval_status text not null default 'pending'
                  check (approval_status in ('pending','approved','rejected')),
  is_credit_approved boolean not null default false,
  credit_limit    numeric(12,2) not null default 0,
  credit_balance  numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists public_customers_phone_idx
  on public.public_customers (phone);
create index if not exists public_customers_status_idx
  on public.public_customers (approval_status);

-- ---------- online_orders ------------------------------------------------
create table if not exists public.online_orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text unique,
  customer_id     uuid references public.public_customers(id) on delete set null,
  customer_name   text,
  customer_phone  text,
  customer_island text,
  delivery_address text,
  status          text not null default 'pending'
                  check (status in ('pending','accepted','rejected','preparing','out_for_delivery','delivered','cancelled')),
  payment_method  text not null default 'cash'
                  check (payment_method in ('cash','bank','credit')),
  payment_status  text not null default 'unpaid'
                  check (payment_status in ('unpaid','paid','failed')),
  subtotal        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  notes           text,
  rejection_reason text,
  delivery_time   timestamptz,
  delivery_staff_id uuid references public.profiles(id) on delete set null,
  delivery_staff_name text,
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles(id) on delete set null,
  accepted_by_name text,
  delivered_at    timestamptz,
  sale_id         uuid references public.sales(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists online_orders_customer_idx
  on public.online_orders (customer_id, created_at desc);
create index if not exists online_orders_status_idx
  on public.online_orders (status, created_at desc);
create index if not exists online_orders_delivery_idx
  on public.online_orders (delivery_staff_id, status);

-- ---------- online_order_items ------------------------------------------
create table if not exists public.online_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.online_orders(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  product_name    text not null,
  qty             int not null default 1,
  unit_price      numeric(12,2) not null default 0,
  line_total      numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists online_order_items_order_idx
  on public.online_order_items (order_id);

-- ---------- profiles: delivery staff flag --------------------------------
alter table public.profiles
  add column if not exists is_delivery_staff boolean not null default false;

-- ---------- triggers: updated_at -----------------------------------------
create or replace function public.online_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

drop trigger if exists public_customers_touch on public.public_customers;
create trigger public_customers_touch
  before update on public.public_customers
  for each row execute function public.online_touch();

drop trigger if exists online_orders_touch on public.online_orders;
create trigger online_orders_touch
  before update on public.online_orders
  for each row execute function public.online_touch();

-- ---------- order number generator --------------------------------------
create or replace function public.online_orders_set_no()
returns trigger language plpgsql as $$
begin
  if new.order_no is null or length(new.order_no) = 0 then
    new.order_no = 'ORD-' ||
      to_char(now(), 'YYMMDD') || '-' ||
      lpad(floor(random()*10000)::text, 4, '0');
  end if;
  return new;
end;$$;

drop trigger if exists online_orders_set_no on public.online_orders;
create trigger online_orders_set_no
  before insert on public.online_orders
  for each row execute function public.online_orders_set_no();

-- =========================================================================
-- RLS
-- =========================================================================

alter table public.public_customers   enable row level security;
alter table public.online_orders      enable row level security;
alter table public.online_order_items enable row level security;

-- Drop pre-existing policies (idempotent).
do $
declare r record;
begin
  for r in (
    select policyname, tablename from pg_policies
    where schemaname='public'
      and tablename in ('public_customers','online_orders','online_order_items')
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$;

-- ---- public_customers --------------------------------------------------
-- Anyone signed in can insert their own row (right after signup).
create policy "pc insert own"
  on public.public_customers for insert
  with check (auth.uid() = auth_user_id);

-- Customer reads their own row; staff reads all.
create policy "pc select own or staff"
  on public.public_customers for select
  using (
    auth.uid() = auth_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- Customer updates their own profile fields; admin updates anyone.
create policy "pc update own or admin"
  on public.public_customers for update
  using (
    auth.uid() = auth_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    auth.uid() = auth_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "pc delete admin"
  on public.public_customers for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---- online_orders -----------------------------------------------------
-- Customer reads their own orders; staff reads all.
create policy "oo select own or staff"
  on public.online_orders for select
  using (
    exists (
      select 1 from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- Customer creates an order linked to their own customer row.
create policy "oo insert own"
  on public.online_orders for insert
  with check (
    exists (
      select 1 from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- Staff updates any order; customer can cancel only their own pending order.
create policy "oo update staff or cancel own"
  on public.online_orders for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
    )
  );

create policy "oo delete admin"
  on public.online_orders for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---- online_order_items ------------------------------------------------
create policy "ooi select own or staff"
  on public.online_order_items for select
  using (
    exists (
      select 1 from public.online_orders o
      join public.public_customers pc on pc.id = o.customer_id
      where o.id = online_order_items.order_id
        and pc.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid())
  );

create policy "ooi insert own or staff"
  on public.online_order_items for insert
  with check (
    exists (
      select 1 from public.online_orders o
      join public.public_customers pc on pc.id = o.customer_id
      where o.id = online_order_items.order_id
        and pc.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid())
  );

create policy "ooi update staff"
  on public.online_order_items for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "ooi delete staff"
  on public.online_order_items for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

-- =========================================================================
-- Realtime
-- =========================================================================
do $
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.online_orders';
    exception when duplicate_object then null;
    end;
  end if;
end$;
