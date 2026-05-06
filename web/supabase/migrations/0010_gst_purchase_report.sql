-- =========================================================================
-- GST Purchase Report + Supplier Bill AI Import
-- =========================================================================

-- 1. Supplier bill uploads (raw uploaded bill, before approval) -----------
create table if not exists public.supplier_bill_uploads (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  bill_no       text,
  bill_date     date,
  file_url      text,
  file_name     text,
  raw_text      text,
  notes         text,
  total_amount  numeric(12,2) not null default 0,
  gst_amount    numeric(12,2) not null default 0,
  non_gst_amount numeric(12,2) not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  rejected_reason text
);

create index if not exists supplier_bill_uploads_status_idx
  on public.supplier_bill_uploads(status, uploaded_at desc);
create index if not exists supplier_bill_uploads_date_idx
  on public.supplier_bill_uploads(bill_date desc);

-- 2. Supplier bill items (parsed/extracted line items) --------------------
create table if not exists public.supplier_bill_items (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null references public.supplier_bill_uploads(id) on delete cascade,
  description   text not null,
  qty           numeric(12,3) not null default 0,
  unit_price    numeric(12,2) not null default 0,
  line_total    numeric(12,2) not null default 0,
  gst_applicable boolean not null default true,
  gst_amount    numeric(12,2) not null default 0,
  position      int not null default 0
);

create index if not exists supplier_bill_items_upload_idx
  on public.supplier_bill_items(upload_id, position);

-- 3. Approval audit trail -------------------------------------------------
create table if not exists public.supplier_bill_approvals (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null references public.supplier_bill_uploads(id) on delete cascade,
  action        text not null check (action in ('approved','rejected','reopened')),
  reason        text,
  acted_by      uuid references public.profiles(id) on delete set null,
  acted_at      timestamptz not null default now()
);

create index if not exists supplier_bill_approvals_upload_idx
  on public.supplier_bill_approvals(upload_id, acted_at desc);

-- 4. Approved GST purchase report header --------------------------------
create table if not exists public.gst_purchase_reports (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid references public.supplier_bill_uploads(id) on delete set null,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  bill_no       text,
  bill_date     date not null,
  total_amount  numeric(12,2) not null default 0,
  gst_amount    numeric(12,2) not null default 0,
  non_gst_amount numeric(12,2) not null default 0,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz not null default now(),
  notes         text
);

create index if not exists gst_purchase_reports_date_idx
  on public.gst_purchase_reports(bill_date desc);
create index if not exists gst_purchase_reports_supplier_idx
  on public.gst_purchase_reports(supplier_id);

-- 5. Approved GST purchase report items ---------------------------------
create table if not exists public.gst_purchase_report_items (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.gst_purchase_reports(id) on delete cascade,
  description   text not null,
  qty           numeric(12,3) not null default 0,
  unit_price    numeric(12,2) not null default 0,
  line_total    numeric(12,2) not null default 0,
  gst_applicable boolean not null default true,
  gst_amount    numeric(12,2) not null default 0,
  position      int not null default 0
);

create index if not exists gst_purchase_report_items_report_idx
  on public.gst_purchase_report_items(report_id, position);

-- 6. RLS ------------------------------------------------------------------
alter table public.supplier_bill_uploads enable row level security;
alter table public.supplier_bill_items enable row level security;
alter table public.supplier_bill_approvals enable row level security;
alter table public.gst_purchase_reports enable row level security;
alter table public.gst_purchase_report_items enable row level security;

-- Reads: any authenticated staff (cashier excluded at app layer).
drop policy if exists "sbu read" on public.supplier_bill_uploads;
drop policy if exists "sbu write" on public.supplier_bill_uploads;
create policy "sbu read" on public.supplier_bill_uploads
  for select using (auth.role() = 'authenticated');
create policy "sbu write" on public.supplier_bill_uploads
  for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

drop policy if exists "sbi read" on public.supplier_bill_items;
drop policy if exists "sbi write" on public.supplier_bill_items;
create policy "sbi read" on public.supplier_bill_items
  for select using (auth.role() = 'authenticated');
create policy "sbi write" on public.supplier_bill_items
  for all
  using (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

drop policy if exists "sba read" on public.supplier_bill_approvals;
drop policy if exists "sba write" on public.supplier_bill_approvals;
create policy "sba read" on public.supplier_bill_approvals
  for select using (auth.role() = 'authenticated');
create policy "sba write" on public.supplier_bill_approvals
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

drop policy if exists "gpr read" on public.gst_purchase_reports;
drop policy if exists "gpr write" on public.gst_purchase_reports;
create policy "gpr read" on public.gst_purchase_reports
  for select using (auth.role() = 'authenticated');
create policy "gpr write" on public.gst_purchase_reports
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

drop policy if exists "gpri read" on public.gst_purchase_report_items;
drop policy if exists "gpri write" on public.gst_purchase_report_items;
create policy "gpri read" on public.gst_purchase_report_items
  for select using (auth.role() = 'authenticated');
create policy "gpri write" on public.gst_purchase_report_items
  for all
  using (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));
