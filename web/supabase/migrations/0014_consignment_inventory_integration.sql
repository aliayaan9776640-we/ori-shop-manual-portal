-- =========================================================================
-- 0014_consignment_inventory_integration.sql
-- Wire consignment items into the main inventory + sales pipeline so
-- consignment stock appears in Inventory, sells through POS, and shows
-- up in Sales reports while still feeding the consignment settlement
-- ledger.
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1. Mark products that originated from consignment intakes.
alter table public.products
  add column if not exists is_consignment boolean not null default false;

create index if not exists products_is_consignment_idx
  on public.products(is_consignment) where is_consignment = true;

-- 2. Link each consignment intake to the inventory product it feeds.
alter table public.consignment_items
  add column if not exists inventory_product_id uuid
    references public.products(id) on delete set null;

create index if not exists consignment_items_product_idx
  on public.consignment_items(inventory_product_id);

-- 3. Link consignment sales back to the canonical sales row when the sale
--    was rung up through POS / addSale.
alter table public.consignment_sales
  add column if not exists sale_id uuid
    references public.sales(id) on delete set null;

create index if not exists consignment_sales_sale_idx
  on public.consignment_sales(sale_id);

-- 4. Verification helper.
do $$
declare
  has_link boolean;
  has_flag boolean;
  has_sale boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consignment_items'
      and column_name = 'inventory_product_id'
  ) into has_link;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'is_consignment'
  ) into has_flag;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consignment_sales'
      and column_name = 'sale_id'
  ) into has_sale;
  raise notice 'consignment_items.inventory_product_id present: %', has_link;
  raise notice 'products.is_consignment present: %', has_flag;
  raise notice 'consignment_sales.sale_id present: %', has_sale;
end$$;
