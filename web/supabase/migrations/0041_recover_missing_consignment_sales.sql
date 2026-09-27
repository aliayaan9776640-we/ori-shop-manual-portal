-- Recover historical POS lines that reduced inventory but were never mirrored
-- into the consignment owner ledger. Idempotent: only the difference between
-- each POS product quantity and its existing linked ledger quantity is added.
-- Inventory is intentionally not changed because the original POS sale already
-- deducted it.

-- One legacy intake was created as a consignment Inventory product but its
-- consignment_items row was lost. Reconstruct it from the product's recorded
-- owner category/prices and its five sold + one remaining units. This does not
-- alter Inventory stock.
insert into public.consignment_items (
  owner_id,
  name,
  unit_type,
  qty_received,
  selling_price,
  owner_payout,
  commission_pct,
  received_date,
  notes,
  inventory_product_id,
  created_at
)
select
  '4af65844-59e4-490c-a4c5-88c8836dd72a'::uuid,
  p.name,
  'piece',
  6,
  p.selling_price,
  p.purchase_price,
  0,
  p.created_at::date,
  'Recovered missing legacy consignment intake link',
  p.id,
  p.created_at
from public.products p
where p.id = '7033984b-ba0c-40e1-a58c-446b847b7772'::uuid
  and not exists (
    select 1
    from public.consignment_items ci
    where ci.inventory_product_id = p.id
  );

do $$
declare
  v_sale record;
  v_item record;
  v_remaining numeric;
  v_take numeric;
  v_available numeric;
  v_unit_price numeric;
  v_total numeric;
  v_commission numeric;
  v_payable numeric;
begin
  for v_sale in
    with pos as (
      select
        s.id as sale_id,
        s.created_at,
        s.customer_id,
        s.user_id,
        si.product_id,
        sum(si.qty) as pos_qty,
        sum(si.line_total) as pos_total
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      join public.products p on p.id = si.product_id
      where p.is_consignment = true
      group by s.id, s.created_at, s.customer_id, s.user_id, si.product_id
    ),
    mirrored as (
      select
        cs.sale_id,
        ci.inventory_product_id as product_id,
        sum(cs.qty) as ledger_qty
      from public.consignment_sales cs
      join public.consignment_items ci on ci.id = cs.item_id
      where cs.sale_id is not null
      group by cs.sale_id, ci.inventory_product_id
    )
    select
      pos.*,
      greatest(0, pos.pos_qty - coalesce(mirrored.ledger_qty, 0)) as missing_qty
    from pos
    left join mirrored
      on mirrored.sale_id = pos.sale_id
     and mirrored.product_id = pos.product_id
    where pos.pos_qty - coalesce(mirrored.ledger_qty, 0) > 0.0005
    order by pos.created_at, pos.sale_id
  loop
    v_remaining := v_sale.missing_qty;
    v_unit_price := case
      when v_sale.pos_qty > 0 then v_sale.pos_total / v_sale.pos_qty
      else 0
    end;

    -- FIFO using only stock, sales, and returns that existed at the original
    -- sale time. Later returns must not make an earlier valid sale disappear.
    for v_item in
      select ci.*
      from public.consignment_items ci
      where ci.inventory_product_id = v_sale.product_id
        and ci.active = true
        and ci.received_date <= v_sale.created_at::date
      order by ci.received_date, ci.created_at, ci.id
    loop
      select greatest(
        0,
        v_item.qty_received
        - coalesce((
            select sum(cs.qty)
            from public.consignment_sales cs
            left join public.sales source_sale on source_sale.id = cs.sale_id
            where cs.item_id = v_item.id
              and (
                (cs.sale_id is not null and source_sale.created_at <= v_sale.created_at)
                or (cs.sale_id is null and cs.created_at <= v_sale.created_at)
              )
          ), 0)
        - coalesce((
            select sum(cr.qty)
            from public.consignment_returns cr
            where cr.item_id = v_item.id
              and cr.created_at <= v_sale.created_at
          ), 0)
      ) into v_available;

      v_take := least(v_remaining, v_available);
      if v_take <= 0 then
        continue;
      end if;

      v_total := v_take * v_unit_price;
      v_commission := case
        when v_item.commission_pct > 0
          then v_total * (v_item.commission_pct / 100)
        else greatest(0, v_total - v_take * v_item.owner_payout)
      end;
      v_payable := case
        when v_item.commission_pct > 0
          then greatest(0, v_total - v_commission)
        else v_take * v_item.owner_payout
      end;

      insert into public.consignment_sales (
        item_id,
        owner_id,
        qty,
        unit_price,
        owner_payout,
        total_amount,
        payable_amount,
        commission,
        customer_id,
        user_id,
        sale_id,
        notes,
        created_at
      ) values (
        v_item.id,
        v_item.owner_id,
        v_take,
        v_unit_price,
        v_item.owner_payout,
        v_total,
        v_payable,
        v_commission,
        v_sale.customer_id,
        v_sale.user_id,
        v_sale.sale_id,
        'Recovered from historical POS sale',
        v_sale.created_at
      );

      v_remaining := v_remaining - v_take;
      exit when v_remaining <= 0.0005;
    end loop;

    if v_remaining > 0.0005 then
      -- Legacy returns did not deduct Inventory, so some returned ghost stock
      -- was subsequently sold. Preserve that return audit trail, but recover
      -- the real POS sale against the most recent owner intake that existed on
      -- the sale date. The note makes this exceptional allocation explicit.
      select ci.* into v_item
      from public.consignment_items ci
      where ci.inventory_product_id = v_sale.product_id
        and ci.received_date <= v_sale.created_at::date
      order by ci.received_date desc, ci.created_at desc, ci.id desc
      limit 1;

      if not found then
        raise exception
          'Cannot recover sale %, product %: no consignment intake exists',
          v_sale.sale_id,
          v_sale.product_id;
      end if;

      v_total := v_remaining * v_unit_price;
      v_commission := case
        when v_item.commission_pct > 0
          then v_total * (v_item.commission_pct / 100)
        else greatest(0, v_total - v_remaining * v_item.owner_payout)
      end;
      v_payable := case
        when v_item.commission_pct > 0
          then greatest(0, v_total - v_commission)
        else v_remaining * v_item.owner_payout
      end;

      insert into public.consignment_sales (
        item_id, owner_id, qty, unit_price, owner_payout, total_amount,
        payable_amount, commission, customer_id, user_id, sale_id, notes,
        created_at
      ) values (
        v_item.id, v_item.owner_id, v_remaining, v_unit_price,
        v_item.owner_payout, v_total, v_payable, v_commission,
        v_sale.customer_id, v_sale.user_id, v_sale.sale_id,
        'Recovered from historical POS sale (legacy returned-stock conflict)',
        v_sale.created_at
      );
    end if;
  end loop;
end;
$$;
