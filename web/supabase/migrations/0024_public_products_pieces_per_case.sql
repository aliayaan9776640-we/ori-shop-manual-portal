-- =========================================================================
-- 0024_public_products_pieces_per_case.sql
-- Expose pieces_per_case on the public_products view so the customer-facing
-- /store page can render both piece and case prices and let buyers add to
-- cart by piece or by case. Idempotent — safe to re-run.
-- =========================================================================

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
  coalesce(p.pieces_per_case, 1) as pieces_per_case
from public.products p
where p.stock_pieces > 0;

grant select on public.public_products to anon, authenticated;

grant select (
  id, name, category, selling_price, stock_pieces,
  photo_url, expiry_date, unit_type, barcode, pieces_per_case
) on public.products to anon, authenticated;
