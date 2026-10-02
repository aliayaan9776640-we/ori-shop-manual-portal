begin;
alter table public.finance_accounts add column auto_receipts boolean not null default false;
alter table public.finance_accounts add constraint finance_auto_bank check(not auto_receipts or kind='bank');
create unique index finance_one_receiving_bank on public.finance_accounts(auto_receipts) where auto_receipts;
create function public.finance_set_receiving_bank(p_account uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(42842001);
  if not exists(select 1 from public.finance_accounts where id=p_account and kind='bank') then raise exception 'Select a bank account'; end if;
  update public.finance_accounts set auto_receipts=false where auto_receipts;
  update public.finance_accounts set auto_receipts=true where id=p_account;
end $$;
revoke all on function public.finance_set_receiving_bank(uuid) from public;
grant execute on function public.finance_set_receiving_bank(uuid) to authenticated;
create function public.finance_first_bank() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(42842001);
  if new.kind='bank' and not exists(select 1 from public.finance_accounts where kind='bank') then new.auto_receipts:=true; end if;
  return new;
end $$;
revoke all on function public.finance_first_bank() from public;
create trigger finance_first_bank before insert on public.finance_accounts for each row execute function public.finance_first_bank();
create function public.finance_auto_bank_credit() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare bank_id uuid;
begin
  perform pg_advisory_xact_lock(42842001);
  select id into bank_id from public.finance_accounts where auto_receipts;
  if bank_id is null then return new; end if;
  if new.card_sales>0 then
    update public.finance_accounts set balance=balance+new.card_sales where id=bank_id;
    insert into public.finance_entries(kind,amount,destination_id,drawer_id,reason,created_by)
      values('card_settlement',new.card_sales,bank_id,new.drawer_id,'Automatic card credit at drawer closing',auth.uid());
  end if;
  if new.transfer_sales>0 then
    update public.finance_accounts set balance=balance+new.transfer_sales where id=bank_id;
    insert into public.finance_entries(kind,amount,destination_id,drawer_id,reason,created_by)
      values('transfer_settlement',new.transfer_sales,bank_id,new.drawer_id,'Automatic transfer credit at drawer closing',auth.uid());
  end if;
  new.card_settled:=true;
  new.transfer_settled:=true;
  return new;
end $$;
revoke all on function public.finance_auto_bank_credit() from public;
create trigger finance_auto_bank_credit before insert on public.finance_closings for each row execute function public.finance_auto_bank_credit();
notify pgrst, 'reload schema';
commit;
