-- =========================================================================
-- 0025_product_publish_status.sql
-- Product approval workflow between Inventory and Online Shop.
-- Adds publish_status / approved_by / approved_at columns to products and
-- restricts the public_products view to approved items only. Inventory and
-- POS continue to read the full products table directly, so they are
-- unaffected. Idempotent — safe to re-run.
-- =========================================================================

-- 1) Columns -------------------------------------------------------------
alter table public.products
  add column if not exists publish_status text
    not null default 'pending'
    check (publish_status in ('draft','pending','approved','rejected'));

alter table public.products
  add column if not exists approved_by uuid references auth.users(id);

alter table public.products
  add column if not exists approved_at timestamptz;

create index if not exists products_publish_status_idx
  on public.products (publish_status);

-- 2) Backfill: existing products are considered approved so we don't break
--    the live store on first migration. New rows default to 'pending'.
update public.products
  set publish_status = 'approved'
  where publish_status is null
     or publish_status = 'pending';

-- 3) Public view: only approved products are visible to anon/customer.
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
  p.publish_status
from public.products p
where p.stock_pieces > 0
  and p.publish_status = 'approved';

grant select on public.public_products to anon, authenticated;

-- Keep the previously granted column-level read on products. We don't
-- expose publish_status to anon to avoid leaking moderation state.
grant select (
  id, name, category, selling_price, stock_pieces,
  photo_url, expiry_date, unit_type, barcode, pieces_per_case
) on public.products to anon, authenticated;
