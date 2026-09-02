-- Allow fractional KG/gram inventory and POS quantities without changing
-- existing whole-number piece/case data.

begin;

-- PostgreSQL does not allow changing stock_pieces while this view depends on
-- it. Recreate the same storefront projection in this transaction.
drop view if exists public.public_products;

alter table public.products
  alter column stock_pieces type numeric(14,3) using stock_pieces::numeric;

alter table public.inventory_transactions
  alter column qty type numeric(14,3) using qty::numeric;

alter table public.sale_items
  alter column qty type numeric(14,3) using qty::numeric;

alter table public.stock_batches
  alter column qty_pieces type numeric(14,3) using qty_pieces::numeric,
  alter column remaining_pieces type numeric(14,3) using remaining_pieces::numeric;

create view public.public_products
with (security_invoker = true)
as
select
  id,
  name,
  category,
  unit_type,
  size,
  selling_price,
  stock_pieces,
  photo_url,
  expiry_date,
  pieces_per_case,
  created_at,
  brand,
  is_offer,
  discount_pct,
  offer_label
from public.products;

revoke all privileges on public.public_products from public, anon, authenticated;
grant select on public.public_products to anon, authenticated;

commit;
