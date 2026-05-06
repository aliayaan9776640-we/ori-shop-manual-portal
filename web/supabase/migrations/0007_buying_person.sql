-- =========================================================================
-- Buying Person / Purchasing User logging
-- Adds buying_person_id to track who physically bought / arranged the goods
-- (separate from user_id which records who entered the stock entry).
-- =========================================================================

alter table public.stock_batches
  add column if not exists buying_person_id uuid references public.profiles(id) on delete set null;

alter table public.inventory_transactions
  add column if not exists buying_person_id uuid references public.profiles(id) on delete set null;

alter table public.purchase_orders
  add column if not exists buying_person_id uuid references public.profiles(id) on delete set null;

create index if not exists stock_batches_buying_person_idx
  on public.stock_batches(buying_person_id);
create index if not exists inv_tx_buying_person_idx
  on public.inventory_transactions(buying_person_id);
create index if not exists po_buying_person_idx
  on public.purchase_orders(buying_person_id);
