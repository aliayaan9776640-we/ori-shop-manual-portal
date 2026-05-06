-- =========================================================================
-- 0020_public_products_view.sql
-- Expose a SAFE, public-readable view of products for the customer-facing
-- /store page. Guests (anon role) and customers must NOT see cost/profit
-- internals. Idempotent — safe to re-run.
-- =========================================================================

-- Drop & recreate so column changes always take effect.
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
  p.barcode
from public.products p
where p.stock_pieces > 0;

-- Grant read to anon (guests) AND authenticated (customers + staff).
grant select on public.public_products to anon, authenticated;

-- Make sure the underlying table grants don't block the view's privileges.
-- (RLS on products still protects direct reads of cost columns.)
grant select (id, name, category, selling_price, stock_pieces, photo_url, expiry_date, unit_type, barcode)
  on public.products to anon, authenticated;

-- Keep the existing authenticated-only RLS policy on products for direct
-- selects (admin portal). The view bypasses RLS via security_invoker=false
-- (definer rights), so guests/customers get only the safe columns above.
