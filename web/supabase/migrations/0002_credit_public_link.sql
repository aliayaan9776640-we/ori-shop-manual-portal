-- =========================================================================
-- Credit Customer Public Link + RPC
-- =========================================================================

-- 1. Columns ---------------------------------------------------------------
alter table public.customers
  add column if not exists public_token uuid not null default gen_random_uuid();

alter table public.customers
  add column if not exists last_payment_at timestamptz;

create unique index if not exists customers_public_token_key
  on public.customers(public_token);

-- Backfill missing tokens (in case of older rows).
update public.customers
   set public_token = gen_random_uuid()
 where public_token is null;

-- Keep last_payment_at fresh from credit_transactions (best-effort backfill).
update public.customers c
   set last_payment_at = sub.last_at
  from (
    select customer_id, max(created_at) as last_at
      from public.credit_transactions
     where type = 'payment'
     group by customer_id
  ) sub
 where sub.customer_id = c.id
   and (c.last_payment_at is null or c.last_payment_at < sub.last_at);

-- 2. Public RPC ------------------------------------------------------------
-- Returns the customer's credit account + full transaction history (with
-- item lines and cashier name) for a given secure token. SECURITY DEFINER
-- bypasses RLS so anonymous customers can fetch only their own data.
create or replace function public.get_credit_account(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  select case when c.id is null then null else jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'address', c.address,
      'balance', c.balance,
      'credit_limit', c.credit_limit,
      'opening_balance', c.opening_balance,
      'last_payment_at', c.last_payment_at,
      'created_at', c.created_at
    ),
    'transactions', coalesce((
      select jsonb_agg(t_obj order by created_at desc)
      from (
        select
          t.created_at,
          jsonb_build_object(
            'id', t.id,
            'type', t.type,
            'amount', t.amount,
            'note', t.note,
            'sale_id', t.sale_id,
            'cashier', p.full_name,
            'payment_method', s.payment_method,
            'created_at', t.created_at,
            'items', case
              when t.sale_id is not null then (
                select jsonb_agg(jsonb_build_object(
                  'name', coalesce(pr.name, '(item)'),
                  'qty',  si.qty,
                  'unit', si.unit_type,
                  'price', si.unit_price,
                  'total', si.line_total
                ))
                from sale_items si
                left join products pr on pr.id = si.product_id
                where si.sale_id = t.sale_id
              )
              else null
            end
          ) as t_obj
        from credit_transactions t
        left join profiles p on p.id = t.user_id
        left join sales    s on s.id = t.sale_id
        where t.customer_id = c.id
      ) sub
    ), '[]'::jsonb)
  ) end
  into result
  from customers c
  where c.public_token = p_token
  limit 1;

  return result;
end;
$$;

grant execute on function public.get_credit_account(uuid) to anon, authenticated;
