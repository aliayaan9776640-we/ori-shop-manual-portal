begin;

-- Repair ambiguous category options only; historical products cannot be
-- reclassified safely from an ambiguous value.
update public.dropdown_options set value='packed'
where group_key='product_category' and label='Packed' and value='gram';
update public.dropdown_options set value='rice'
where group_key='product_category' and label='Rice' and value='Kg';
create unique index if not exists dropdown_category_value_unique
on public.dropdown_options(group_key,value) where group_key='product_category';

-- Reject stale drawer snapshots instead of silently overwriting a payout.
alter table public.cash_drawers add column if not exists revision bigint not null default 0;
create or replace function public.check_drawer_revision() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.revision <> old.revision then
    raise exception 'Cash drawer changed on another screen. Refresh and try again.';
  end if;
  new.revision := old.revision+1;
  return new;
end $$;
create trigger check_drawer_revision before update on public.cash_drawers
for each row execute function public.check_drawer_revision();

create table public.consignment_receipts(
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.consignment_items(id),
  owner_id uuid not null references public.consignment_owners(id),
  qty numeric(12,3) not null check(qty>0),
  received_date date not null,
  notes text, user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
insert into public.consignment_receipts(item_id,owner_id,qty,received_date,notes,created_at)
select id,owner_id,qty_received,received_date,'Opening intake (before dated restock history)',created_at
from public.consignment_items where qty_received>0;
alter table public.consignment_receipts enable row level security;
create policy receipts_read on public.consignment_receipts for select to authenticated
using(public.has_role(array['admin','storekeeper','cashier']));
grant select on public.consignment_receipts to authenticated;
create function public.record_initial_consignment_receipt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.qty_received>0 then
 insert into public.consignment_receipts(item_id,owner_id,qty,received_date,notes,user_id)
 values(new.id,new.owner_id,new.qty_received,new.received_date,'Initial intake',auth.uid());
 end if;
 return new;
end $$;
create trigger initial_consignment_receipt after insert on public.consignment_items
for each row execute function public.record_initial_consignment_receipt();

alter table public.consignment_settlements add column drawer_id text references public.cash_drawers(id);
alter table public.consignment_settlements add column adjusts_id uuid references public.consignment_settlements(id);
alter table public.consignment_returns add column request_id uuid unique;
alter table public.consignment_returns add column return_value numeric(12,2);
-- Historical return value is deliberately left unknown rather than priced
-- using today's rates.

create function public.receive_consignment(
 p_request_id uuid,p_owner_id uuid,p_name text,p_unit text,p_qty numeric,
 p_price numeric,p_payout numeric,p_commission numeric,p_date date,p_notes text default null
) returns public.consignment_items language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.consignment_items; owner_name text; product_id uuid;
begin
 if not coalesce(public.has_role(array['admin','storekeeper']),false) then raise exception 'Stock access required'; end if;
 if p_request_id is null or nullif(trim(p_name),'') is null or p_qty is null or p_qty<=0 or p_qty::text in ('NaN','Infinity')
   or p_price is null or p_price<0 or p_price::text in ('NaN','Infinity')
   or p_payout is null or p_payout<0 or p_payout::text in ('NaN','Infinity')
   or p_commission is null or p_commission<0 or p_commission>100 or p_commission::text='NaN' or p_date is null then raise exception 'Invalid intake details'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into i from public.consignment_items where id=p_request_id;
 if found then
   if i.owner_id<>p_owner_id or i.name<>trim(p_name) or i.qty_received<>p_qty then raise exception 'Request already used'; end if;
   return i;
 end if;
 select name into owner_name from public.consignment_owners where id=p_owner_id and active for update;
 if not found then raise exception 'Active owner required'; end if;
 select ci.inventory_product_id into product_id from public.consignment_items ci
 where ci.owner_id=p_owner_id and lower(trim(ci.name))=lower(trim(p_name)) and ci.unit_type=p_unit and ci.inventory_product_id is not null
 order by ci.created_at desc limit 1;
 if product_id is null then
   insert into public.products(name,category,unit_type,pieces_per_case,stock_pieces,purchase_price,selling_price,is_consignment)
   values(trim(p_name),'Consignment - '||owner_name,case when p_unit='packet' then 'piece' else p_unit end,1,p_qty,p_payout,p_price,true) returning id into product_id;
 else
   update public.products set stock_pieces=stock_pieces+p_qty,selling_price=p_price where id=product_id;
 end if;
 insert into public.consignment_items(id,owner_id,name,unit_type,qty_received,selling_price,owner_payout,commission_pct,received_date,notes,inventory_product_id)
 values(p_request_id,p_owner_id,trim(p_name),p_unit,p_qty,p_price,p_payout,p_commission,p_date,p_notes,product_id) returning * into i;
 insert into public.inventory_transactions(product_id,type,qty,note,user_id)
 values(product_id,'in',p_qty,'Consignment intake '||p_date||' - '||owner_name,auth.uid());
 return i;
end $$;

create or replace function public.restock_consignment(
 p_request_id uuid,p_item_id uuid,p_qty numeric,p_date date,p_notes text default null
) returns public.consignment_receipts language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.consignment_items; r public.consignment_receipts;
begin
 if not coalesce(public.has_role(array['admin','storekeeper']),false) then raise exception 'Stock access required'; end if;
 if p_request_id is null or p_qty is null or p_qty<=0 or p_qty::text in ('NaN','Infinity') or p_date is null then raise exception 'Enter a positive quantity and receipt date'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from public.consignment_receipts where id=p_request_id;
 if found then
   if r.item_id<>p_item_id or r.qty<>p_qty or r.received_date<>p_date then raise exception 'Request already used'; end if;
   return r;
 end if;
 select * into i from public.consignment_items where id=p_item_id for update;
 if not found or not i.active or i.inventory_product_id is null then raise exception 'Active linked item required'; end if;
 perform 1 from public.products where id=i.inventory_product_id for update;
 if not found then raise exception 'Linked product missing'; end if;
 insert into public.consignment_receipts(id,item_id,owner_id,qty,received_date,notes,user_id)
 values(p_request_id,i.id,i.owner_id,p_qty,p_date,nullif(trim(p_notes),''),auth.uid()) returning * into r;
 update public.consignment_items set qty_received=qty_received+p_qty where id=i.id;
 update public.products set stock_pieces=stock_pieces+p_qty where id=i.inventory_product_id;
 insert into public.inventory_transactions(product_id,type,qty,note,user_id)
 values(i.inventory_product_id,'in',p_qty,'Consignment restock '||p_date||' - '||i.name,auth.uid());
 return r;
end $$;

create or replace function public.post_consignment_settlement(
 p_request_id uuid,p_owner_id uuid,p_amount numeric,p_method text,
 p_notes text default null,p_from date default null,p_to date default null,
 p_adjusts_id uuid default null,p_cash_action text default 'linked_drawer'
) returns public.consignment_settlements language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.consignment_settlements; original public.consignment_settlements; d public.cash_drawers; effective numeric;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
 if p_request_id is null or p_amount is null or p_amount=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid amount'; end if;
 if p_from>p_to then raise exception 'Invalid period'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from public.consignment_settlements where id=p_request_id;
 if found then
   if r.owner_id<>p_owner_id or r.amount<>p_amount or r.adjusts_id is distinct from p_adjusts_id then raise exception 'Request already used'; end if;
   return r;
 end if;
 perform 1 from public.consignment_owners where id=p_owner_id for update;
 if not found then raise exception 'Owner not found'; end if;
 if p_adjusts_id is not null then
   if nullif(trim(p_notes),'') is null then raise exception 'Correction reason required'; end if;
   select * into original from public.consignment_settlements where id=p_adjusts_id for update;
   if not found or original.owner_id<>p_owner_id or original.adjusts_id is not null then raise exception 'Select an original payment'; end if;
   select original.amount+coalesce(sum(amount),0) into effective from public.consignment_settlements where adjusts_id=original.id;
   if effective+p_amount<0 then raise exception 'Correction exceeds original payment'; end if;
   p_method := original.payment_method;
   if p_cash_action not in ('linked_drawer','ledger_only') or p_cash_action is null then raise exception 'Choose correction cash treatment'; end if;
   if p_method='cash' and p_cash_action='linked_drawer' then
     if original.drawer_id is null then raise exception 'Legacy payment has no linked drawer; reconcile it before correction'; end if;
     select * into d from public.cash_drawers where id=original.drawer_id for update;
     if not found or d.status<>'open' then raise exception 'Original drawer is closed. Reconcile through finance; closed drawer history cannot be changed.'; end if;
   end if;
 else
   if p_amount<0 then raise exception 'Payment must be positive'; end if;
   if p_method not in ('cash','bank') or p_method is null then raise exception 'Choose cash or bank'; end if;
   if p_method='cash' then
     select * into d from public.cash_drawers where status='open' order by opened_at desc limit 1 for update;
     if not found then raise exception 'Open the POS cash drawer before recording a cash settlement'; end if;
   end if;
 end if;
 if p_method='cash' and (p_adjusts_id is null or p_cash_action='linked_drawer') then
   if coalesce(d.cash_used,0)+p_amount<0 then raise exception 'Drawer cash-used total cannot become negative'; end if;
   update public.cash_drawers set cash_used=coalesce(cash_used,0)+p_amount where id=d.id;
 end if;
 insert into public.consignment_settlements(id,owner_id,amount,payment_method,period_from,period_to,notes,user_id,drawer_id,adjusts_id)
 values(p_request_id,p_owner_id,p_amount,p_method,p_from,p_to,
   case when p_adjusts_id is not null then '['||p_cash_action||'] '||trim(p_notes) else nullif(trim(p_notes),'') end,
   auth.uid(),d.id,p_adjusts_id) returning * into r;
 return r;
end $$;

create or replace function public.return_consignment_once(p_request_id uuid,p_item_id uuid,p_qty numeric,p_notes text default null)
returns public.consignment_returns language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.consignment_returns; i public.consignment_items;
begin
 if not coalesce(public.has_role(array['admin','storekeeper']),false) then raise exception 'Stock access required'; end if;
 if p_request_id is null or p_qty is null or p_qty<=0 or p_qty::text in ('NaN','Infinity') then raise exception 'Enter a positive quantity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into r from public.consignment_returns where request_id=p_request_id;
 if found then
   if r.item_id<>p_item_id or r.qty<>p_qty then raise exception 'Request already used'; end if;
   return r;
 end if;
 select * into i from public.consignment_items where id=p_item_id for update;
 if not found then raise exception 'Item not found'; end if;
 -- Reconcile against the actual recorded movements before validating return.
 update public.consignment_items set
   qty_sold=coalesce((select sum(qty) from public.consignment_sales where item_id=i.id),0),
   qty_returned=coalesce((select sum(qty) from public.consignment_returns where item_id=i.id),0)
 where id=i.id;
 r := public.record_consignment_return(p_item_id,p_qty,p_notes);
 update public.consignment_returns set request_id=p_request_id,
   return_value=round(p_qty * case when i.commission_pct>0 then i.selling_price*(1-i.commission_pct/100) else i.owner_payout end,2)
 where id=r.id returning * into r;
 return r;
end $$;

revoke all on function public.restock_consignment(uuid,uuid,numeric,date,text) from public;
revoke all on function public.receive_consignment(uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text) from public;
grant execute on function public.receive_consignment(uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text) to authenticated;
revoke all on function public.post_consignment_settlement(uuid,uuid,numeric,text,text,date,date,uuid,text) from public;
revoke all on function public.return_consignment_once(uuid,uuid,numeric,text) from public;
grant execute on function public.restock_consignment(uuid,uuid,numeric,date,text) to authenticated;
grant execute on function public.post_consignment_settlement(uuid,uuid,numeric,text,text,date,date,uuid,text) to authenticated;
grant execute on function public.return_consignment_once(uuid,uuid,numeric,text) to authenticated;
-- Payments are append-only, made through the atomic RPC.
revoke insert,update,delete on public.consignment_settlements from authenticated;
notify pgrst,'reload schema';
commit;
