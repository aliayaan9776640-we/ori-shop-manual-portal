begin;
create or replace function public.finance_post(p_request uuid, p_kind text, p_amount numeric,
  p_account uuid default null, p_reason text default null, p_drawer text default null,
  p_fee numeric default 0) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cash_id uuid; result_id uuid; source uuid; destination uuid; c public.finance_closings;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(42842001);
  if p_request is null then raise exception 'Request ID required'; end if;
  select id into result_id from public.finance_entries where request_id=p_request;
  if found then return result_id; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount < 0
    or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then
    raise exception 'Enter a valid amount with at most two decimal places'; end if;
  if p_fee is null or p_fee::text in ('NaN','Infinity','-Infinity') or p_fee<0
    or p_fee>p_amount or p_fee<>round(p_fee,2) then raise exception 'Invalid settlement fee'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'A reason is required (maximum 500 characters)'; end if;
  if p_kind <> 'card_settlement' and p_fee<>0 then raise exception 'Fees are only allowed for card settlements'; end if;
  select id into cash_id from public.finance_accounts where kind='cash';
  if p_kind='initialize' then
    if cash_id is not null then raise exception 'Cash tracking is already initialized'; end if;
    if exists(select 1 from public.cash_drawers where status='open') then raise exception 'Close all drawers before initializing cash tracking'; end if;
    insert into public.finance_accounts(name,kind,balance) values('Cash on hand','cash',p_amount) returning id into destination;
  elsif cash_id is null then raise exception 'Initialize cash tracking first';
  elsif p_kind='bank_opening' then
    if length(trim(p_reason))>100 then raise exception 'Account name must be at most 100 characters'; end if;
    insert into public.finance_accounts(name,kind,balance) values(trim(p_reason),'bank',p_amount) returning id into destination;
  else
    if p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
    if p_kind in ('deposit','bank_receipt','bank_expense','card_settlement','transfer_settlement') then
      if not exists(select 1 from public.finance_accounts where id=p_account and kind='bank') then raise exception 'Select a bank account'; end if;
    end if;
    case p_kind
      when 'deposit' then source:=cash_id; destination:=p_account;
      when 'bank_receipt' then destination:=p_account;
      when 'cash_expense' then source:=cash_id;
      when 'bank_expense' then source:=p_account;
      when 'cash_receipt' then destination:=cash_id;
      when 'card_settlement','transfer_settlement' then
        select * into c from public.finance_closings where drawer_id=p_drawer for update;
        if not found then raise exception 'Drawer closing not found'; end if;
        if p_kind='card_settlement' then
          if c.card_settled or p_amount<>c.card_sales then raise exception 'Card receipts already settled or amount does not match'; end if;
          update public.finance_closings set card_settled=true where drawer_id=p_drawer;
        else
          if c.transfer_settled or p_amount<>c.transfer_sales then raise exception 'Transfers already settled or amount does not match'; end if;
          update public.finance_closings set transfer_settled=true where drawer_id=p_drawer;
        end if;
        destination:=p_account;
      else raise exception 'Unsupported transaction type';
    end case;
    if source is not null then
      update public.finance_accounts set balance=balance-p_amount where id=source and balance>=p_amount;
      if not found then raise exception 'Insufficient available balance'; end if;
    end if;
    if destination is not null then update public.finance_accounts set balance=balance+p_amount-p_fee where id=destination; end if;
  end if;
  insert into public.finance_entries(request_id,kind,amount,fee,source_id,destination_id,drawer_id,reason,created_by)
    values(p_request,p_kind,p_amount,p_fee,source,destination,
      case when p_kind in ('card_settlement','transfer_settlement') then p_drawer end,trim(p_reason),auth.uid()) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.finance_post(uuid,text,numeric,uuid,text,text,numeric) from public;
grant execute on function public.finance_post(uuid,text,numeric,uuid,text,text,numeric) to authenticated;


notify pgrst,'reload schema';
commit;
