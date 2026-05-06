-- =========================================================================
-- Credit Billing: Send Queue + Statement Helpers
-- =========================================================================

-- 1. Pending sends queue (admin-managed) ----------------------------------
create table if not exists public.credit_send_queue (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.customers(id) on delete cascade,
  customer_name text,
  customer_phone text,
  amount        numeric(12,2) not null default 0,
  kind          text not null default 'statement'
                check (kind in ('bill','statement','reminder')),
  message       text,
  link          text,
  status        text not null default 'pending'
                check (status in ('pending','sent','failed','skipped')),
  period_start  date,
  period_end    date,
  sent_at       timestamptz,
  sent_by       uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists credit_send_queue_status_idx
  on public.credit_send_queue(status, created_at desc);

alter table public.credit_send_queue enable row level security;

drop policy if exists "csq read" on public.credit_send_queue;
drop policy if exists "csq write" on public.credit_send_queue;

create policy "csq read" on public.credit_send_queue
  for select using (auth.role() = 'authenticated');

create policy "csq write" on public.credit_send_queue
  for all
  using (public.has_role(array['admin','cashier']))
  with check (public.has_role(array['admin','cashier']));

-- 2. Helpful indexes for credit reporting ---------------------------------
create index if not exists credit_transactions_customer_date_idx
  on public.credit_transactions(customer_id, created_at desc);
