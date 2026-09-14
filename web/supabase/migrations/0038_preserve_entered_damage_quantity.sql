-- Keep the operator's entered quantity (for example 355 grams) separately
-- from qty, which stores the inventory-base quantity (0.355 kg).

begin;

alter table public.damaged_items
  add column if not exists entered_qty numeric(14,3);

update public.damaged_items
set entered_qty = qty
where entered_qty is null;

commit;
