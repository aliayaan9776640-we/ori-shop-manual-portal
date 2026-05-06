-- =========================================================================
-- 0016_sales_drawer_link.sql
-- Link POS sales to the cash drawer session they were rung up under.
-- This is the source of truth for the Cash Drawer report — Expected Drawer
-- Cash and Cash Sales must be reconstructable from sales.drawer_id.
-- Idempotent — safe to re-run.
-- =========================================================================

alter table public.sales
  add column if not exists drawer_id text
    references public.cash_drawers(id) on delete set null;

create index if not exists sales_drawer_id_idx
  on public.sales (drawer_id);

-- Keep change_given on each sale (for refund / void reversal symmetry).
alter table public.sales
  add column if not exists change_given numeric not null default 0;
