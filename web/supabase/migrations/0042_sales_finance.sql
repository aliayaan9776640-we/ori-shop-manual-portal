-- Admin treasury ledger. No historical cash is imported: initialize with a reconciled balance.
begin;
create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  kind text not null check (kind in ('cash','bank')),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);
create unique index finance_one_cash on public.finance_accounts(kind) where kind='cash';
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique,
  kind text not null,
  amount numeric(14,2) not null check(amount >= 0),
  fee numeric(14,2) not null default 0 check(fee >= 0),
  source_id uuid references public.finance_accounts,
  destination_id uuid references public.finance_accounts,
  drawer_id text references public.cash_drawers(id) on delete restrict,
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index finance_drawer_once on public.finance_entries(drawer_id,kind) where drawer_id is not null;
create table public.finance_closings (
  drawer_id text primary key references public.cash_drawers(id) on delete restrict,
  closed_at timestamptz not null,
  cashier_name text,
  opening_cash numeric(14,2) not null,
  cash_sales numeric(14,2) not null,
  deductions numeric(14,2) not null,
  change_given numeric(14,2) not null,
  counted_cash numeric(14,2) not null,
  difference numeric(14,2) not null,
  card_sales numeric(14,2) not null,
  transfer_sales numeric(14,2) not null,
  card_settled boolean not null default false,
  transfer_settled boolean not null default false
);
alter table public.finance_accounts enable row level security;
alter table public.finance_entries enable row level security;
alter table public.finance_closings enable row level security;
create policy finance_admin_read on public.finance_accounts for select to authenticated using(public.is_admin());
create policy finance_admin_read on public.finance_entries for select to authenticated using(public.is_admin());
create policy finance_admin_read on public.finance_closings for select to authenticated using(public.is_admin());
revoke all on public.finance_accounts,public.finance_entries,public.finance_closings from anon,authenticated;
grant select on public.finance_accounts,public.finance_entries,public.finance_closings to authenticated;

-- A single transaction lock serializes setup, drawer movements and admin entries.
create function public.finance_post(p_request uuid, p_kind text, p_amount numeric,
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
    if p_kind in ('deposit','bank_expense','card_settlement','transfer_settlement') then
      if not exists(select 1 from public.finance_accounts where id=p_account and kind='bank') then raise exception 'Select a bank account'; end if;
    end if;
    case p_kind
      when 'deposit' then source:=cash_id; destination:=p_account;
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

create function public.finance_drawer_sync() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cash_id uuid; tracked boolean; amount_to_check numeric;
begin
  perform pg_advisory_xact_lock(42842001);
  select id into cash_id from public.finance_accounts where kind='cash';
  if cash_id is null then return new; end if;
  foreach amount_to_check in array array[new.opening_cash,new.counted_cash,new.cash_sales,new.card_sales,new.bank_sales,new.cash_used,new.change_given] loop
    if amount_to_check is null or amount_to_check<0 or amount_to_check::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Drawer amounts must be finite and non-negative';
    end if;
  end loop;
  if TG_OP='INSERT' then
    if new.status<>'open' then raise exception 'New drawers must be opened before closing'; end if;
    if new.opening_cash<0 then raise exception 'Opening cash cannot be negative'; end if;
    update public.finance_accounts set balance=balance-new.opening_cash where id=cash_id and balance>=new.opening_cash;
    if not found then raise exception 'Not enough cash on hand for opening float. Ask an admin to record incoming cash first.'; end if;
    insert into public.finance_entries(kind,amount,source_id,drawer_id,reason,created_by)
      values('drawer_open',new.opening_cash,cash_id,new.id,'Opening float issued to drawer',auth.uid());
    return new;
  end if;
  select exists(select 1 from public.finance_entries where drawer_id=new.id and kind='drawer_open') into tracked;
  if not tracked then return new; end if;
  if new.opening_cash is distinct from old.opening_cash then raise exception 'Tracked opening float cannot be edited'; end if;
  if old.status<>'open' then
    if new.status='open' or row(new.counted_cash,new.cash_sales,new.card_sales,new.bank_sales,new.cash_used,new.change_given,new.difference,new.closed_at)
      is distinct from row(old.counted_cash,old.cash_sales,old.card_sales,old.bank_sales,old.cash_used,old.change_given,old.difference,old.closed_at) then
      raise exception 'Posted drawer amounts cannot be edited. Record a separate correction with a reason.';
    end if;
    return new;
  end if;
  if new.status in ('closed','approved') then
    if new.counted_cash is null or new.counted_cash<0 or new.closed_at is null then raise exception 'A valid cash count and closing time are required'; end if;
    update public.finance_accounts set balance=balance+new.counted_cash where id=cash_id;
    insert into public.finance_entries(kind,amount,destination_id,drawer_id,reason,created_by)
      values('drawer_close',new.counted_cash,cash_id,new.id,'Counted cash returned after drawer deductions',auth.uid());
    insert into public.finance_closings(drawer_id,closed_at,cashier_name,opening_cash,cash_sales,deductions,change_given,counted_cash,difference,card_sales,transfer_sales)
      values(new.id,new.closed_at,new.cashier_name,new.opening_cash,new.cash_sales,new.cash_used,new.change_given,new.counted_cash,new.difference,new.card_sales,new.bank_sales);
  end if;
  return new;
end;
$$;
revoke all on function public.finance_drawer_sync() from public;
create trigger finance_drawer_sync after insert or update on public.cash_drawers for each row execute function public.finance_drawer_sync();
do $$ declare t text; begin
  foreach t in array array['finance_accounts','finance_entries','finance_closings'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
create function public.finance_snapshot(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
  if p_offset<0 then raise exception 'Invalid offset'; end if;
  return jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(a order by a.created_at) from public.finance_accounts a),'[]'::jsonb),
    'closings',coalesce((select jsonb_agg(c order by c.closed_at desc) from public.finance_closings c),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(e order by e.created_at desc,e.id) from
      (select * from public.finance_entries order by created_at desc,id limit 100 offset p_offset) e),'[]'::jsonb),
    'entry_count',(select count(*) from public.finance_entries),
    'open_float',coalesce((select sum(e.amount) from public.finance_entries e where e.kind='drawer_open'
      and not exists(select 1 from public.finance_entries c where c.drawer_id=e.drawer_id and c.kind='drawer_close')),0)
  );
end $$;
revoke all on function public.finance_snapshot(integer) from public;
grant execute on function public.finance_snapshot(integer) to authenticated;
commit;
