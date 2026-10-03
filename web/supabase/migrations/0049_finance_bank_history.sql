begin;
create function public.finance_bank_history(p_account uuid default null,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Admin access required'; end if;
 if p_offset<0 then raise exception 'Invalid offset'; end if;
 if p_account is not null and not exists(select 1 from finance_accounts where id=p_account and kind='bank') then raise exception 'Select a bank account'; end if;
 with banks as (select * from finance_accounts where kind='bank' and (p_account is null or id=p_account)),
 movements as (
  select e.*,coalesce(src.name,'Other source') as source_name,coalesce(dst.name,'Outside account') as destination_name,
    (case when e.destination_id in (select id from banks) then e.amount-e.fee else 0 end
    -case when e.source_id in (select id from banks) then e.amount else 0 end) as change
  from finance_entries e left join finance_accounts src on src.id=e.source_id left join finance_accounts dst on dst.id=e.destination_id
  where e.source_id in (select id from banks) or e.destination_id in (select id from banks)
 ), statement as (
  select m.*,coalesce((select sum(balance) from banks),0)-coalesce(sum(change) over(order by created_at desc,id desc rows between unbounded preceding and 1 preceding),0) as balance_after
  from movements m
 ), page as (select * from statement order by created_at desc,id desc limit 50 offset p_offset)
 select jsonb_build_object('count',(select count(*) from movements),'entries',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('transfers',
   coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.created_at,'name',to_jsonb(s)->>'bank_transfer_name','reference',to_jsonb(s)->>'bank_transfer_phone','invoice',s.invoice_no,
     'amount',case when s.payment_method='bank' then s.total else coalesce(s.bank_amount,0) end) order by s.created_at desc,s.id)
     from sales s where p.kind='transfer_settlement' and s.drawer_id::text=p.drawer_id and s.payment_method in ('bank','split')
       and not coalesce((to_jsonb(s)->>'voided')::boolean,false)),'[]'::jsonb)) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.finance_bank_history(uuid,integer) from public;
grant execute on function public.finance_bank_history(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
