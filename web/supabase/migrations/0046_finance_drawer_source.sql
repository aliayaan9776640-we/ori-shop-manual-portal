begin;
create or replace function public.finance_snapshot(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
  if p_offset<0 then raise exception 'Invalid offset'; end if;
  return jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(a order by a.created_at) from public.finance_accounts a),'[]'::jsonb),
    'closings',coalesce((select jsonb_agg(c order by c.closed_at desc,c.drawer_id) from (
      select d.id as drawer_id,d.closed_at,d.cashier_name,d.opening_cash,d.cash_sales,
        d.cash_used as deductions,d.change_given,d.counted_cash,d.difference,
        d.counted_cash-d.difference as recorded_expected,d.card_sales,d.bank_sales as transfer_sales,
        coalesce(f.card_settled,false) as card_settled,coalesce(f.transfer_settled,false) as transfer_settled,
        f.drawer_id is not null as tracked
      from public.cash_drawers d left join public.finance_closings f on f.drawer_id=d.id
      where d.status in ('closed','approved') and d.closed_at is not null
    ) c),'[]'::jsonb),
    'active_drawers',(select count(*) from public.cash_drawers where status='open'),
    'entries',coalesce((select jsonb_agg(e order by e.created_at desc,e.id) from
      (select * from public.finance_entries order by created_at desc,id limit 100 offset p_offset) e),'[]'::jsonb),
    'entry_count',(select count(*) from public.finance_entries),
    'open_float',coalesce((select sum(e.amount) from public.finance_entries e where e.kind='drawer_open'
      and not exists(select 1 from public.finance_entries c where c.drawer_id=e.drawer_id and c.kind='drawer_close')),0)
  );
end $$;
revoke all on function public.finance_snapshot(integer) from public;
grant execute on function public.finance_snapshot(integer) to authenticated;

-- Publish only an admin-readable invalidation, never underlying sale/customer data.
create table public.finance_refresh_signals(id boolean primary key default true check(id), changed_at timestamptz not null default clock_timestamp());
alter table public.finance_refresh_signals enable row level security;
revoke all on public.finance_refresh_signals from anon,authenticated;
grant select on public.finance_refresh_signals to authenticated;
create policy finance_signal_admin on public.finance_refresh_signals for select to authenticated using(public.is_admin());
create function public.signal_finance_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.finance_refresh_signals(id,changed_at) values(true,clock_timestamp())
    on conflict(id) do update set changed_at=excluded.changed_at;
  return null;
end $$;
revoke all on function public.signal_finance_change() from public;
create trigger finance_drawer_changed after insert or update or delete on public.cash_drawers for each statement execute function public.signal_finance_change();
create trigger finance_sales_changed after insert or update or delete on public.sales for each statement execute function public.signal_finance_change();
alter publication supabase_realtime add table public.finance_refresh_signals;
notify pgrst,'reload schema';

create or replace function public.finance_dashboard(p_day date default (now() at time zone 'Indian/Maldives')::date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; month_start timestamptz; month_end timestamptz;
begin
  if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
  if p_day is null then raise exception 'Select a date'; end if;
  month_start := date_trunc('month',p_day::timestamp) at time zone 'Indian/Maldives';
  month_end := (date_trunc('month',p_day::timestamp)+interval '1 month') at time zone 'Indian/Maldives';
  select jsonb_build_object('days',coalesce(jsonb_agg(d order by d.day),'[]'::jsonb)) into result from (
    select (s.created_at at time zone 'Indian/Maldives')::date as day,
      coalesce(sum(s.total),0) as total,
      coalesce(sum(case when s.payment_method='cash' then s.total when s.payment_method='split' then coalesce(s.cash_amount,0) else 0 end),0) as cash,
      coalesce(sum(case when s.payment_method='card' then s.total else 0 end),0) as card,
      coalesce(sum(case when s.payment_method='bank' then s.total when s.payment_method='split' then coalesce(s.bank_amount,0) else 0 end),0) as bank,
      coalesce(sum(case when s.payment_method='credit' then s.total else 0 end),0) as credit
    from public.sales s where not coalesce((to_jsonb(s)->>'voided')::boolean,false)
      and s.created_at >= ((p_day-6)::timestamp at time zone 'Indian/Maldives')
      and s.created_at < ((p_day+1)::timestamp at time zone 'Indian/Maldives')
    group by 1
  ) d;
  return result || jsonb_build_object(
    'deposited',coalesce((select sum(amount) from finance_entries where kind='deposit' and created_at>=month_start and created_at<month_end),0),
    'used',coalesce((select sum(case when kind in ('cash_expense','bank_expense') then amount else 0 end)+sum(fee) from finance_entries where created_at>=month_start and created_at<month_end),0)
      +coalesce((select sum(cash_used) from cash_drawers where status in ('closed','approved') and closed_at>=month_start and closed_at<month_end),0),
    'recorders',coalesce((select jsonb_object_agg(id,full_name) from profiles where id in (select created_by from finance_entries)),'{}'::jsonb)
  );
end $$;
revoke all on function public.finance_dashboard(date) from public;
grant execute on function public.finance_dashboard(date) to authenticated;

commit;
