begin;
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
      +coalesce((select sum(deductions) from finance_closings where closed_at>=month_start and closed_at<month_end),0),
    'recorders',coalesce((select jsonb_object_agg(id,full_name) from profiles where id in (select created_by from finance_entries)),'{}'::jsonb)
  );
end $$;
revoke all on function public.finance_dashboard(date) from public;
grant execute on function public.finance_dashboard(date) to authenticated;
notify pgrst,'reload schema';
commit;

