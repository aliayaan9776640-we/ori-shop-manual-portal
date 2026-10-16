begin;
lock table public.cash_drawers in share row exclusive mode;
select pg_advisory_xact_lock(42842001);
update public.finance_accounts set exclude_opening_float=true where kind='cash';
-- Reverse the previous restoration explicitly; retain all original movements.
with reversals as (
 insert into public.finance_entries(kind,amount,source_id,drawer_id,reason,restores_entry_id)
 select 'drawer_float_reconciled',e.amount,e.destination_id,e.drawer_id,
 'Reverse prior float restoration: only counted cash less opening float is collected',e.id
 from public.finance_entries e join public.finance_accounts a on a.id=e.destination_id
 where a.kind='cash' and e.kind in ('drawer_float_restored','drawer_open_restored')
 on conflict (restores_entry_id) do nothing returning source_id,amount
), totals as (select source_id,sum(amount) amount from reversals group by source_id)
update public.finance_accounts a set balance=a.balance-t.amount from totals t where a.id=t.source_id;
-- Also reconcile any drawers closed while the full-count rule was active.
with exclusions as (
 insert into public.finance_entries(kind,amount,source_id,drawer_id,reason)
 select 'drawer_float_excluded',d.opening_cash,e.destination_id,d.id,
 'Opening float reconciliation for full-count closing; cash-outs already in actual count'
 from public.finance_entries e join public.cash_drawers d on d.id=e.drawer_id
 where e.kind='drawer_close' and not exists(select 1 from public.finance_entries x where x.drawer_id=d.id and x.kind='drawer_float_excluded')
 on conflict do nothing returning source_id,amount
), totals as (select source_id,sum(amount) amount from exclusions group by source_id)
update public.finance_accounts a set balance=a.balance-t.amount from totals t where a.id=t.source_id;
create or replace function public.finance_drawer_sync() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cash_id uuid; amount_to_check numeric;
begin
  perform pg_advisory_xact_lock(42842001);
  select id into cash_id from public.finance_accounts where kind='cash';
  if cash_id is null then return new; end if;
  foreach amount_to_check in array array[new.opening_cash,new.counted_cash,new.cash_sales,new.card_sales,new.bank_sales,new.cash_used,new.change_given] loop
    if amount_to_check is null or amount_to_check<0 or amount_to_check::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Drawer amounts must be finite and non-negative';
    end if;
  end loop;
  if cash_id is not null then
    if TG_OP='INSERT' then
      if new.status<>'open' then raise exception 'New drawers must be opened before closing'; end if;
      insert into public.finance_entries(kind,amount,drawer_id,reason,created_by)
        values('drawer_open',0,new.id,'Drawer opened; on-hand cash changes only through manual entries',auth.uid());
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
        values('drawer_float_excluded',new.opening_cash,cash_id,new.id,'Opening float excluded once; drawer cash-outs already reflected in counted cash',auth.uid());
      insert into public.finance_closings(drawer_id,closed_at,cashier_name,opening_cash,cash_sales,deductions,change_given,counted_cash,difference,card_sales,transfer_sales)
        values(new.id,new.closed_at,new.cashier_name,new.opening_cash,new.cash_sales,new.cash_used,new.change_given,new.counted_cash,new.difference,new.card_sales,new.bank_sales);
    end if;
    return new;
  end if;
  return new;
end;
$$;
revoke all on function public.finance_drawer_sync() from public;
notify pgrst,'reload schema';
commit;
