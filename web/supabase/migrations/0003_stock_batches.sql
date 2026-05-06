-- =========================================================================
-- Stock Batches + Expiry Tracking
-- Each stock-in creates a batch row; sales/damage consume FIFO by expiry.
-- =========================================================================

create table if not exists public.stock_batches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  batch_no          text,
  qty_pieces        int  not null default 0,
  remaining_pieces  int  not null default 0,
  purchase_date     date not null default current_date,
  expiry_date       date,
  user_id           uuid references public.profiles(id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists stock_batches_product_idx
  on public.stock_batches(product_id);
create index if not exists stock_batches_expiry_idx
  on public.stock_batches(product_id, expiry_date nulls last, created_at);

alter table public.stock_batches enable row level security;

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public' and tablename = 'stock_batches'
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

create policy "batch read"  on public.stock_batches for select
  using (auth.role() = 'authenticated');
create policy "batch write" on public.stock_batches for all
  using (public.has_role(array['admin','storekeeper','cashier']))
  with check (public.has_role(array['admin','storekeeper','cashier']));
