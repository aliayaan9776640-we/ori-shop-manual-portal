-- =========================================================================
-- 0021_customer_active_and_order_approval.sql
-- 1. Add `active` flag to public_customers (default true).
-- 2. Tighten online_orders insert RLS so only approved + active customers
--    can place orders. Staff inserts still allowed.
-- Idempotent — safe to re-run.
-- =========================================================================

alter table public.public_customers
  add column if not exists active boolean not null default true;

create index if not exists public_customers_active_idx
  on public.public_customers (active);

-- Replace the customer-insert policy so unapproved/inactive customers
-- cannot insert online_orders. Staff (any row in public.profiles) can
-- still insert on behalf of customers (e.g. phone-in orders).
drop policy if exists "oo insert own" on public.online_orders;

create policy "oo insert own approved"
  on public.online_orders for insert
  with check (
    exists (
      select 1
      from public.public_customers pc
      where pc.id = online_orders.customer_id
        and pc.auth_user_id = auth.uid()
        and pc.approval_status = 'approved'
        and pc.active = true
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid()
    )
  );

-- Items insert: same constraint, mirroring orders.
drop policy if exists "ooi insert own or staff" on public.online_order_items;

create policy "ooi insert own approved or staff"
  on public.online_order_items for insert
  with check (
    exists (
      select 1
      from public.online_orders o
      join public.public_customers pc on pc.id = o.customer_id
      where o.id = online_order_items.order_id
        and pc.auth_user_id = auth.uid()
        and pc.approval_status = 'approved'
        and pc.active = true
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid()
    )
  );
