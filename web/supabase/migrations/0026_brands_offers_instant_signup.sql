-- =========================================================================
-- 0026_brands_offers_instant_signup.sql
-- Adds brand & offer support to products, a shop_brands admin table, and
-- removes the customer approval requirement so customers can register and
-- order immediately. Idempotent — safe to re-run.
-- =========================================================================

-- ---------- 1. shop_brands -----------------------------------------------
create table if not exists public.shop_brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  logo_url    text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shop_brands_active_idx
  on public.shop_brands (active);

alter table public.shop_brands enable row level security;

do $$
declare r record;
begin
  for r in (
    select policyname from pg_policies
    where schemaname='public' and tablename='shop_brands'
  ) loop
    execute format('drop policy if exists %I on public.shop_brands', r.policyname);
  end loop;
end $$;

-- Anyone (anon/customer) can read active brands.
create policy "shop_brands read"
  on public.shop_brands for select
  using (true);

-- Only admins can write.
create policy "shop_brands admin write"
  on public.shop_brands for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

grant select on public.shop_brands to anon, authenticated;

-- ---------- 2. products: brand + offer columns ---------------------------
alter table public.products
  add column if not exists brand text;

alter table public.products
  add column if not exists is_offer boolean not null default false;

alter table public.products
  add column if not exists discount_pct numeric(5,2) not null default 0;

alter table public.products
  add column if not exists offer_label text;

create index if not exists products_brand_idx on public.products (brand);
create index if not exists products_is_offer_idx on public.products (is_offer);

-- ---------- 3. public_products view (rebuild with new columns) -----------
drop view if exists public.public_products;

create view public.public_products
with (security_invoker = false) as
select
  p.id,
  p.name,
  p.category,
  p.selling_price,
  p.stock_pieces,
  p.photo_url,
  p.expiry_date,
  p.unit_type,
  p.barcode,
  coalesce(p.pieces_per_case, 1) as pieces_per_case,
  p.publish_status,
  p.created_at,
  p.brand,
  p.is_offer,
  p.discount_pct,
  p.offer_label
from public.products p
where p.stock_pieces > 0
  and p.publish_status = 'approved';

grant select on public.public_products to anon, authenticated;

grant select (
  id, name, category, selling_price, stock_pieces,
  photo_url, expiry_date, unit_type, barcode, pieces_per_case,
  created_at, brand, is_offer, discount_pct, offer_label
) on public.products to anon, authenticated;

-- ---------- 4. Customers: instant approval -------------------------------
-- New customers default to approved so they can checkout immediately.
alter table public.public_customers
  alter column approval_status set default 'approved';

-- Approve any existing pending customers so the storefront flows cleanly.
update public.public_customers
  set approval_status = 'approved'
  where approval_status = 'pending';

-- Loosen the order-insert RLS so any signed-in customer (active) can place
-- an order. Approval is no longer required.
drop policy if exists "oo insert own approved" on public.online_orders;
drop policy if exists "oo insert own" on public.online_orders;

create policy "oo insert own active"
  on public.online_orders for insert
  with check (
    exists (
      select 1 from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
        and pc.active = true
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "ooi insert own approved or staff" on public.online_order_items;
drop policy if exists "ooi insert own or staff" on public.online_order_items;

create policy "ooi insert own active or staff"
  on public.online_order_items for insert
  with check (
    exists (
      select 1
      from public.online_orders o
      join public.public_customers pc on pc.id = o.customer_id
      where o.id = online_order_items.order_id
        and pc.auth_user_id = auth.uid()
        and pc.active = true
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid()
    )
  );

-- ---------- 5. updated_at trigger for shop_brands ------------------------
drop trigger if exists shop_brands_touch on public.shop_brands;
create trigger shop_brands_touch
  before update on public.shop_brands
  for each row execute function public.online_touch();
