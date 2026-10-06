-- Permanent credit-balance calculation without deleting or rewriting history.
-- Existing sales and credit transactions remain unchanged. Customer.balance is
-- a derived value maintained from the append-only credit ledger.

alter table public.sales add column if not exists voided boolean not null default false;
alter table public.sales add column if not exists voided_at timestamptz;
alter table public.sales add column if not exists voided_by uuid references public.profiles(id) on delete set null;
alter table public.sales add column if not exists void_reason text;

-- Ignore stale public-customer links whose Auth account no longer exists.
-- This prevents a balance refresh from failing on an unrelated orphaned link.
create or replace function public.signal_checkout_credit_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.credit_refresh_signals(auth_user_id,customer_id,changed_at)
    select distinct pc.auth_user_id,new.id,statement_timestamp()
    from public.public_customers pc
    join auth.users au on au.id = pc.auth_user_id
    where lower(trim(pc.name))=lower(trim(new.name))
      and regexp_replace(coalesce(pc.phone,''),'\D','','g')=regexp_replace(coalesce(new.phone,''),'\D','','g')
    on conflict(auth_user_id,customer_id) do update set changed_at=excluded.changed_at;
  if tg_op='UPDATE' then
    insert into public.credit_refresh_signals(auth_user_id,customer_id,changed_at)
      select distinct pc.auth_user_id,new.id,statement_timestamp()
      from public.public_customers pc
      join auth.users au on au.id = pc.auth_user_id
      where lower(trim(pc.name))=lower(trim(old.name))
        and regexp_replace(coalesce(pc.phone,''),'\D','','g')=regexp_replace(coalesce(old.phone,''),'\D','','g')
      on conflict(auth_user_id,customer_id) do update set changed_at=excluded.changed_at;
  end if;
  return new;
end;
$$;
revoke all on function public.signal_checkout_credit_change() from public;

create or replace function public.recalculate_credit_balance(p_customer_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare calculated numeric(12,2);
begin
  select round(coalesce(sum(case when type = 'payment' then -amount else amount end), 0)::numeric, 2)
    into calculated from public.credit_transactions where customer_id = p_customer_id;
  calculated := greatest(calculated, 0);
  update public.customers set balance = calculated,
    last_payment_at = (select max(t.created_at) from public.credit_transactions t
                       where t.customer_id = p_customer_id and t.type = 'payment')
    where id = p_customer_id;
  return calculated;
end;
$$;
revoke all on function public.recalculate_credit_balance(uuid) from public, anon, authenticated;

create or replace function public.credit_transaction_balance_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_credit_balance(old.customer_id);
    return old;
  end if;
  perform public.recalculate_credit_balance(new.customer_id);
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.recalculate_credit_balance(old.customer_id);
  end if;
  return new;
end;
$$;
revoke all on function public.credit_transaction_balance_trigger() from public;
drop trigger if exists credit_transaction_updates_balance on public.credit_transactions;
create trigger credit_transaction_updates_balance
after insert or update or delete on public.credit_transactions
for each row execute function public.credit_transaction_balance_trigger();

create or replace function public.validate_credit_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare outstanding numeric(12,2);
begin
  new.amount := round(new.amount::numeric, 2);
  if new.amount <= 0 then raise exception 'Credit transaction amount must be greater than zero'; end if;
  if new.type = 'payment' and new.sale_id is null then
    select round(coalesce(sum(case when type = 'payment' then -amount else amount end), 0)::numeric, 2)
      into outstanding from public.credit_transactions
      where customer_id = new.customer_id and (tg_op = 'INSERT' or id <> new.id);
    if new.amount > greatest(outstanding, 0) + 0.004 then
      raise exception 'Payment MVR % exceeds outstanding balance MVR %',
        to_char(new.amount, 'FM999999990.00'), to_char(greatest(outstanding, 0), 'FM999999990.00');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_credit_transaction() from public;
drop trigger if exists validate_credit_transaction_amount on public.credit_transactions;
create trigger validate_credit_transaction_amount before insert or update on public.credit_transactions
for each row execute function public.validate_credit_transaction();

-- Append ledger movements for new/changed credit sales. Historical rows are
-- never deleted or rewritten; corrections are recorded as balancing entries.
create or replace function public.append_credit_sale_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta numeric(12,2);
begin
  if tg_op = 'UPDATE' then
    if old.payment_method = 'credit' and old.customer_id is not null
       and (new.payment_method <> 'credit' or new.customer_id is distinct from old.customer_id) then
      insert into public.credit_transactions(customer_id, type, amount, sale_id, note, user_id)
      values (old.customer_id, 'payment', round(old.total::numeric, 2), old.id,
              'Credit sale changed or cancelled', new.user_id);
    end if;

    if new.payment_method = 'credit' and new.customer_id is not null then
      if old.payment_method <> 'credit' or new.customer_id is distinct from old.customer_id then
        insert into public.credit_transactions(customer_id, type, amount, sale_id, note, user_id)
        values (new.customer_id, 'sale', round(new.total::numeric, 2), new.id,
                'Credit sale changed', new.user_id);
      elsif not coalesce(old.voided, false) and coalesce(new.voided, false) then
        insert into public.credit_transactions(customer_id, type, amount, sale_id, note, user_id)
        values (new.customer_id, 'payment', round(new.total::numeric, 2), new.id,
                coalesce('Sale voided: ' || nullif(new.void_reason, ''), 'Sale voided'), new.voided_by);
      elsif not coalesce(new.voided, false) and new.total is distinct from old.total then
        delta := round((new.total - old.total)::numeric, 2);
        insert into public.credit_transactions(customer_id, type, amount, sale_id, note, user_id)
        values (new.customer_id, case when delta > 0 then 'sale' else 'payment' end,
                abs(delta), new.id, 'Credit sale amount adjusted', new.user_id);
      end if;
    end if;
    return new;
  end if;

  if new.payment_method = 'credit' and new.customer_id is not null
     and not exists (select 1 from public.credit_transactions where sale_id = new.id and type = 'sale') then
    insert into public.credit_transactions(customer_id, type, amount, sale_id, note, user_id, created_at)
    values (new.customer_id, 'sale', round(new.total::numeric, 2), new.id,
            'Credit sale', new.user_id, new.created_at);
  end if;
  return new;
end;
$$;
revoke all on function public.append_credit_sale_ledger() from public;
drop trigger if exists sync_credit_sale_to_ledger on public.sales;
drop trigger if exists delete_credit_sale_ledger on public.sales;
drop trigger if exists append_credit_sale_to_ledger on public.sales;
create trigger append_credit_sale_to_ledger after insert on public.sales
for each row execute function public.append_credit_sale_ledger();
drop trigger if exists append_credit_sale_update_to_ledger on public.sales;
create trigger append_credit_sale_update_to_ledger after update on public.sales
for each row execute function public.append_credit_sale_ledger();

create or replace function public.record_credit_payment(
  p_customer_id uuid, p_amount numeric, p_note text default null
)
returns table(transaction_id uuid, balance numeric)
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.has_role(array['admin','cashier']) then raise exception 'Not allowed to record credit payments'; end if;
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Credit customer not found'; end if;
  insert into public.credit_transactions(customer_id, type, amount, note, user_id)
  values (p_customer_id, 'payment', round(p_amount::numeric, 2), nullif(trim(p_note), ''), auth.uid())
  returning id into new_id;
  return query select new_id, c.balance from public.customers c where c.id = p_customer_id;
end;
$$;
revoke all on function public.record_credit_payment(uuid,numeric,text) from public, anon;
grant execute on function public.record_credit_payment(uuid,numeric,text) to authenticated;

-- Repair only the derived balance. No transaction-history row is changed.
do $$
declare c record;
begin
  for c in select id from public.customers loop
    perform public.recalculate_credit_balance(c.id);
  end loop;
end;
$$;
