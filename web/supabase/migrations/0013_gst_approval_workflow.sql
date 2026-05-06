-- =========================================================================
-- GST Purchase Report — Approval workflow + item matching + RLS hardening
-- Safe to run multiple times.
-- =========================================================================

-- 1. Extend status check on supplier_bill_uploads to support draft + needs_correction.
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'public.supplier_bill_uploads'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%pending%';
  if c_name is not null then
    execute format('alter table public.supplier_bill_uploads drop constraint %I', c_name);
  end if;
end $$;

alter table public.supplier_bill_uploads
  add constraint supplier_bill_uploads_status_check
  check (status in ('draft','pending','approved','rejected','needs_correction'));

alter table public.supplier_bill_uploads
  add column if not exists correction_note text,
  add column if not exists submitted_at timestamptz;

-- 2. Extend supplier_bill_items for matching + decisioning.
alter table public.supplier_bill_items
  add column if not exists matched_product_id   uuid references public.products(id) on delete set null,
  add column if not exists product_action       text not null default 'match'
    check (product_action in ('match','create','skip')),
  add column if not exists decision             text not null default 'pending'
    check (decision in ('pending','approved','rejected')),
  add column if not exists unit_type            text,
  add column if not exists pieces_per_case      int,
  add column if not exists correction_note      text,
  add column if not exists new_product_name     text,
  add column if not exists new_product_barcode  text,
  add column if not exists new_product_category text,
  add column if not exists new_supplier_id      uuid references public.suppliers(id) on delete set null;

create index if not exists supplier_bill_items_matched_idx
  on public.supplier_bill_items(matched_product_id);

-- 3. RLS hardening — cashier blocked at DB layer.
alter table public.supplier_bill_uploads enable row level security;
alter table public.supplier_bill_items   enable row level security;
alter table public.supplier_bill_approvals enable row level security;
alter table public.gst_purchase_reports  enable row level security;
alter table public.gst_purchase_report_items enable row level security;

-- supplier_bill_uploads: read+write for admin/storekeeper, block cashier
drop policy if exists "sbu read"  on public.supplier_bill_uploads;
drop policy if exists "sbu write" on public.supplier_bill_uploads;
create policy "sbu read" on public.supplier_bill_uploads
  for select using (public.has_role(array['admin','storekeeper']));
create policy "sbu insert" on public.supplier_bill_uploads
  for insert with check (public.has_role(array['admin','storekeeper']));
create policy "sbu update" on public.supplier_bill_uploads
  for update
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));
create policy "sbu delete" on public.supplier_bill_uploads
  for delete using (public.has_role(array['admin','storekeeper']));

-- supplier_bill_items: read+write for admin/storekeeper, block cashier
drop policy if exists "sbi read"  on public.supplier_bill_items;
drop policy if exists "sbi write" on public.supplier_bill_items;
create policy "sbi read" on public.supplier_bill_items
  for select using (public.has_role(array['admin','storekeeper']));
create policy "sbi insert" on public.supplier_bill_items
  for insert with check (public.has_role(array['admin','storekeeper']));
create policy "sbi update" on public.supplier_bill_items
  for update
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));
create policy "sbi delete" on public.supplier_bill_items
  for delete using (public.has_role(array['admin','storekeeper']));

-- supplier_bill_approvals: read for admin/storekeeper, write admin only
drop policy if exists "sba read"  on public.supplier_bill_approvals;
drop policy if exists "sba write" on public.supplier_bill_approvals;
create policy "sba read" on public.supplier_bill_approvals
  for select using (public.has_role(array['admin','storekeeper']));
create policy "sba write" on public.supplier_bill_approvals
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

-- gst_purchase_reports: read for admin/storekeeper, write admin only
drop policy if exists "gpr read"  on public.gst_purchase_reports;
drop policy if exists "gpr write" on public.gst_purchase_reports;
create policy "gpr read" on public.gst_purchase_reports
  for select using (public.has_role(array['admin','storekeeper']));
create policy "gpr write" on public.gst_purchase_reports
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

-- gst_purchase_report_items: read for admin/storekeeper, write admin only
drop policy if exists "gpri read"  on public.gst_purchase_report_items;
drop policy if exists "gpri write" on public.gst_purchase_report_items;
create policy "gpri read" on public.gst_purchase_report_items
  for select using (public.has_role(array['admin','storekeeper']));
create policy "gpri write" on public.gst_purchase_report_items
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));
