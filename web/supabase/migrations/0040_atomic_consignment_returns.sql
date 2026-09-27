-- Keep consignment returns and their linked inventory stock in sync.
-- The row locks make concurrent POS sales / returns safe and prevent a
-- completed return from leaving sellable "ghost stock" in Inventory.

create or replace function public.record_consignment_return(
  p_item_id uuid,
  p_qty numeric,
  p_notes text default null
)
returns public.consignment_returns
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.consignment_items%rowtype;
  v_return public.consignment_returns%rowtype;
  v_balance numeric;
  v_stock numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Return quantity must be greater than zero';
  end if;

  select * into v_item
  from public.consignment_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Consignment item not found';
  end if;

  v_balance := v_item.qty_received - v_item.qty_sold - v_item.qty_returned;
  if p_qty > v_balance then
    raise exception 'Return quantity % exceeds available balance %', p_qty, v_balance;
  end if;

  if v_item.inventory_product_id is null then
    raise exception 'Consignment item is not linked to inventory';
  end if;

  select stock_pieces into v_stock
  from public.products
  where id = v_item.inventory_product_id
  for update;

  if not found then
    raise exception 'Linked inventory product not found';
  end if;

  if v_stock < p_qty then
    raise exception 'Inventory has only % available; cannot return %', v_stock, p_qty;
  end if;

  insert into public.consignment_returns (
    item_id, owner_id, qty, notes, user_id
  ) values (
    v_item.id, v_item.owner_id, p_qty, nullif(trim(p_notes), ''), auth.uid()
  )
  returning * into v_return;

  update public.consignment_items
  set qty_returned = qty_returned + p_qty
  where id = v_item.id;

  update public.products
  set stock_pieces = greatest(0, stock_pieces - p_qty)
  where id = v_item.inventory_product_id;

  insert into public.inventory_transactions (
    product_id, type, qty, note, user_id
  ) values (
    v_item.inventory_product_id,
    'out',
    p_qty,
    'Consignment return - ' || v_item.name,
    auth.uid()
  );

  return v_return;
end;
$$;

grant execute on function public.record_consignment_return(uuid, numeric, text)
  to authenticated;

-- Cashiers can insert consignment_sales but intentionally cannot edit intake
-- rows. Maintain qty_sold with a security-definer trigger so every POS sale,
-- edit, and void keeps the intake ledger correct without broadening cashier
-- permissions.
create or replace function public.sync_consignment_item_qty_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;

  update public.consignment_items
  set qty_sold = coalesce((
    select sum(qty)
    from public.consignment_sales
    where item_id = v_item_id
  ), 0)
  where id = v_item_id;

  if tg_op = 'UPDATE' and old.item_id is distinct from new.item_id then
    update public.consignment_items
    set qty_sold = coalesce((
      select sum(qty)
      from public.consignment_sales
      where item_id = old.item_id
    ), 0)
    where id = old.item_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists consignment_sales_sync_qty_sold
  on public.consignment_sales;
create trigger consignment_sales_sync_qty_sold
after insert or update of item_id, qty or delete
on public.consignment_sales
for each row execute function public.sync_consignment_item_qty_sold();

-- Repair historical counters from the authoritative sale-detail ledger.
update public.consignment_items ci
set qty_sold = coalesce((
  select sum(cs.qty)
  from public.consignment_sales cs
  where cs.item_id = ci.id
), 0);
