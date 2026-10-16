begin;
alter table public.consignment_receipts add column selling_price numeric(12,2);

create function public.restock_consignment_with_price(
 p_request_id uuid,p_item_id uuid,p_qty numeric,p_date date,p_notes text,p_price numeric
) returns public.consignment_receipts
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.consignment_receipts; i public.consignment_items;
begin
 if not coalesce(public.has_role(array['admin','storekeeper']),false) then raise exception 'Stock access required'; end if;
 if p_price is null or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid selling price'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from public.consignment_receipts where id=p_request_id;
 if found then
   if r.item_id<>p_item_id or r.qty<>p_qty or r.received_date<>p_date or r.selling_price is distinct from round(p_price,2) then raise exception 'Request already used'; end if;
   return r;
 end if;
 r := public.restock_consignment(p_request_id,p_item_id,p_qty,p_date,p_notes);
 update public.consignment_items set selling_price=round(p_price,2) where id=p_item_id returning * into i;
 update public.products set selling_price=round(p_price,2) where id=i.inventory_product_id;
 update public.consignment_receipts set selling_price=round(p_price,2) where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.restock_consignment_with_price(uuid,uuid,numeric,date,text,numeric) from public;
grant execute on function public.restock_consignment_with_price(uuid,uuid,numeric,date,text,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
