-- Only private invalidations are published, never customer or credit ledger rows.
begin;
create table public.credit_refresh_signals (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  changed_at timestamptz not null default clock_timestamp(),
  primary key(auth_user_id, customer_id)
);
alter table public.credit_refresh_signals enable row level security;
revoke all on public.credit_refresh_signals from anon, authenticated;
grant select on public.credit_refresh_signals to authenticated;
create policy credit_signal_own on public.credit_refresh_signals for select to authenticated using(auth_user_id=auth.uid());
create function public.signal_checkout_credit_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.credit_refresh_signals(auth_user_id,customer_id,changed_at)
    select distinct pc.auth_user_id,new.id,statement_timestamp() from public.public_customers pc
    where pc.auth_user_id is not null
      and lower(trim(pc.name))=lower(trim(new.name))
      and regexp_replace(coalesce(pc.phone,''),'\D','','g')=regexp_replace(coalesce(new.phone,''),'\D','','g')
    on conflict(auth_user_id,customer_id) do update set changed_at=excluded.changed_at;
  if TG_OP='UPDATE' then
    insert into public.credit_refresh_signals(auth_user_id,customer_id,changed_at)
      select distinct pc.auth_user_id,new.id,statement_timestamp() from public.public_customers pc
      where pc.auth_user_id is not null
        and lower(trim(pc.name))=lower(trim(old.name))
        and regexp_replace(coalesce(pc.phone,''),'\D','','g')=regexp_replace(coalesce(old.phone,''),'\D','','g')
      on conflict(auth_user_id,customer_id) do update set changed_at=excluded.changed_at;
  end if;
  return new;
end $$;
revoke all on function public.signal_checkout_credit_change() from public;
create trigger checkout_credit_changed after insert or update of balance,credit_limit,approval_status,name,phone on public.customers for each row execute function public.signal_checkout_credit_change();
alter publication supabase_realtime add table public.credit_refresh_signals;
notify pgrst, 'reload schema';
commit;
