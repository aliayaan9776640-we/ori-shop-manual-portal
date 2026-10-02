begin;
lock table public.cash_drawers in share row exclusive mode;
-- The owner's collection rule excludes opening float from each day's actual count.
alter table public.finance_accounts add column exclude_opening_float boolean not null default false;
alter table public.finance_accounts drop constraint finance_accounts_balance_check;
alter table public.finance_accounts add constraint finance_accounts_balance_check check(balance>=0 or (kind='cash' and exclude_opening_float));
-- A negative collection balance is a recorded deficit, never permission to spend.
do $$ declare cash_id uuid; begin
  perform pg_advisory_xact_lock(42842001);
  if not exists(select 1 from public.finance_accounts where kind='cash') then
    insert into public.finance_accounts(name,kind,balance,exclude_opening_float)
      select 'Cash collections (opening float excluded)','cash',coalesce(sum(counted_cash-opening_cash),0),true
      from public.cash_drawers where status in ('closed','approved') and closed_at is not null returning id into cash_id;
    insert into public.finance_entries(kind,amount,destination_id,drawer_id,reason,created_at)
      select 'historical_drawer_cash',counted_cash,cash_id,id,'Imported actual closing cash; later unrecorded deposits/spending must be reconciled',closed_at
      from public.cash_drawers where status in ('closed','approved') and closed_at is not null;
    insert into public.finance_entries(kind,amount,source_id,drawer_id,reason,created_at)
      select 'drawer_float_excluded',opening_cash,cash_id,id,'Opening float excluded from historical daily collection',closed_at
      from public.cash_drawers where status in ('closed','approved') and closed_at is not null;
  end if;
end $$;
create or replace function public.finance_drawer_sync() returns trigger
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
  if exists(select 1 from public.finance_accounts where id=cash_id and exclude_opening_float) then
    if TG_OP='INSERT' then
      if new.status<>'open' then raise exception 'New drawers must be opened before closing'; end if;
      insert into public.finance_entries(kind,amount,drawer_id,reason,created_by)
        values('drawer_open',0,new.id,'Opening float is separate from collected cash',auth.uid());
      return new;
    end if;
    if old.status<>'open' then
      if new.status='open' or row(new.opening_cash,new.counted_cash,new.cash_sales,new.card_sales,new.bank_sales,new.cash_used,new.change_given,new.difference,new.closed_at)
        is distinct from row(old.opening_cash,old.counted_cash,old.cash_sales,old.card_sales,old.bank_sales,old.cash_used,old.change_given,old.difference,old.closed_at) then
        raise exception 'Posted drawer amounts cannot be edited. Record a separate correction with a reason.';
      end if;
      return new;
    end if;
    if new.status in ('closed','approved') then
      if new.closed_at is null then raise exception 'Closing time required'; end if;
      update public.finance_accounts set balance=balance+new.counted_cash-new.opening_cash where id=cash_id;
      insert into public.finance_entries(kind,amount,destination_id,drawer_id,reason,created_by)
        values('drawer_close',new.counted_cash,cash_id,new.id,'Actual drawer cash collected; excess already included',auth.uid());
      insert into public.finance_entries(kind,amount,source_id,drawer_id,reason,created_by)
        values('drawer_float_excluded',new.opening_cash,cash_id,new.id,'Opening float excluded from daily collection',auth.uid());
      insert into public.finance_closings(drawer_id,closed_at,cashier_name,opening_cash,cash_sales,deductions,change_given,counted_cash,difference,card_sales,transfer_sales)
        values(new.id,new.closed_at,new.cashier_name,new.opening_cash,new.cash_sales,new.cash_used,new.change_given,new.counted_cash,new.difference,new.card_sales,new.bank_sales);
    end if;
    return new;
  end if;
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

notify pgrst,'reload schema';
commit;
