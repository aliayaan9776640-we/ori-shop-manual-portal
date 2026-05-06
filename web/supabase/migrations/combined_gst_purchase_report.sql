-- =========================================================================
-- COMBINED: GST Purchase Report + Bill Upload + OCR fields
-- Includes:
--   0010_gst_purchase_report.sql
--   0011_gst_report_fields.sql
--   0012_supplier_bill_ocr.sql
-- Idempotent. Safe to re-run any number of times.
-- Run this in Supabase SQL Editor.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Prereq: has_role() helper (defined in schema.sql). Recreate defensively
-- so this file works even if schema.sql wasn't applied first.
-- -------------------------------------------------------------------------
create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = any(roles)
  );
$$;

-- =========================================================================
-- 0010 — Tables
-- =========================================================================

-- 1. Supplier bill uploads ------------------------------------------------
create table if not exists public.supplier_bill_uploads (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid references public.suppliers(id) on delete set null,
  supplier_name   text,
  bill_no         text,
  bill_date       date,
  file_url        text,
  file_name       text,
  raw_text        text,
  notes           text,
  total_amount    numeric(12,2) not null default 0,
  gst_amount      numeric(12,2) not null default 0,
  non_gst_amount  numeric(12,2) not null default 0,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  uploaded_by     uuid references public.profiles(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  rejected_reason text
);

create index if not exists supplier_bill_uploads_status_idx
  on public.supplier_bill_uploads(status, uploaded_at desc);
create index if not exists supplier_bill_uploads_date_idx
  on public.supplier_bill_uploads(bill_date desc);

-- 2. Supplier bill items --------------------------------------------------
create table if not exists public.supplier_bill_items (
  id             uuid primary key default gen_random_uuid(),
  upload_id      uuid not null references public.supplier_bill_uploads(id) on delete cascade,
  description    text not null,
  qty            numeric(12,3) not null default 0,
  unit_price     numeric(12,2) not null default 0,
  line_total     numeric(12,2) not null default 0,
  gst_applicable boolean not null default true,
  gst_amount     numeric(12,2) not null default 0,
  position       int not null default 0
);

create index if not exists supplier_bill_items_upload_idx
  on public.supplier_bill_items(upload_id, position);

-- 3. Approval audit trail -------------------------------------------------
create table if not exists public.supplier_bill_approvals (
  id        uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.supplier_bill_uploads(id) on delete cascade,
  action    text not null check (action in ('approved','rejected','reopened')),
  reason    text,
  acted_by  uuid references public.profiles(id) on delete set null,
  acted_at  timestamptz not null default now()
);

create index if not exists supplier_bill_approvals_upload_idx
  on public.supplier_bill_approvals(upload_id, acted_at desc);

-- 4. Approved GST purchase report header ---------------------------------
create table if not exists public.gst_purchase_reports (
  id             uuid primary key default gen_random_uuid(),
  upload_id      uuid references public.supplier_bill_uploads(id) on delete set null,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  supplier_name  text,
  bill_no        text,
  bill_date      date not null,
  total_amount   numeric(12,2) not null default 0,
  gst_amount     numeric(12,2) not null default 0,
  non_gst_amount numeric(12,2) not null default 0,
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz not null default now(),
  notes          text
);

create index if not exists gst_purchase_reports_date_idx
  on public.gst_purchase_reports(bill_date desc);
create index if not exists gst_purchase_reports_supplier_idx
  on public.gst_purchase_reports(supplier_id);

-- 5. Approved GST purchase report items ----------------------------------
create table if not exists public.gst_purchase_report_items (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.gst_purchase_reports(id) on delete cascade,
  description    text not null,
  qty            numeric(12,3) not null default 0,
  unit_price     numeric(12,2) not null default 0,
  line_total     numeric(12,2) not null default 0,
  gst_applicable boolean not null default true,
  gst_amount     numeric(12,2) not null default 0,
  position       int not null default 0
);

create index if not exists gst_purchase_report_items_report_idx
  on public.gst_purchase_report_items(report_id, position);

-- =========================================================================
-- 0011 — GST official columns (7 fields)
-- =========================================================================

alter table public.supplier_bill_uploads
  add column if not exists supplier_tin           text,
  add column if not exists taxable_activity_no    text,
  add column if not exists invoice_total_excl_gst numeric(12,2) not null default 0,
  add column if not exists gst_charged            numeric(12,2) not null default 0;

alter table public.gst_purchase_reports
  add column if not exists supplier_tin           text,
  add column if not exists taxable_activity_no    text,
  add column if not exists invoice_total_excl_gst numeric(12,2) not null default 0,
  add column if not exists gst_charged            numeric(12,2) not null default 0;

-- Backfill from legacy columns if previously used.
update public.supplier_bill_uploads
set invoice_total_excl_gst = coalesce(non_gst_amount, 0),
    gst_charged            = coalesce(gst_amount, 0)
where invoice_total_excl_gst = 0 and gst_charged = 0
  and (coalesce(non_gst_amount,0) > 0 or coalesce(gst_amount,0) > 0);

update public.gst_purchase_reports
set invoice_total_excl_gst = coalesce(non_gst_amount, 0),
    gst_charged            = coalesce(gst_amount, 0)
where invoice_total_excl_gst = 0 and gst_charged = 0
  and (coalesce(non_gst_amount,0) > 0 or coalesce(gst_amount,0) > 0);

-- =========================================================================
-- 0012 — OCR / AI extraction fields
-- =========================================================================

alter table public.supplier_bill_uploads
  add column if not exists raw_text         text,
  add column if not exists ocr_confidence   numeric(5,4),
  add column if not exists ocr_model        text,
  add column if not exists ocr_extracted_at timestamptz,
  add column if not exists ocr_notes        text;

alter table public.supplier_bill_items
  add column if not exists source         text not null default 'manual',
  add column if not exists ocr_confidence numeric(5,4);

-- Add the source CHECK constraint only if missing.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_bill_items_source_check'
  ) then
    alter table public.supplier_bill_items
      add constraint supplier_bill_items_source_check
      check (source in ('manual','ocr'));
  end if;
end $$;

-- =========================================================================
-- RLS — enable + (re)create policies
-- =========================================================================

alter table public.supplier_bill_uploads     enable row level security;
alter table public.supplier_bill_items       enable row level security;
alter table public.supplier_bill_approvals   enable row level security;
alter table public.gst_purchase_reports      enable row level security;
alter table public.gst_purchase_report_items enable row level security;

drop policy if exists "sbu read"  on public.supplier_bill_uploads;
drop policy if exists "sbu write" on public.supplier_bill_uploads;
create policy "sbu read"  on public.supplier_bill_uploads
  for select using (auth.role() = 'authenticated');
create policy "sbu write" on public.supplier_bill_uploads
  for all
  using      (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

drop policy if exists "sbi read"  on public.supplier_bill_items;
drop policy if exists "sbi write" on public.supplier_bill_items;
create policy "sbi read"  on public.supplier_bill_items
  for select using (auth.role() = 'authenticated');
create policy "sbi write" on public.supplier_bill_items
  for all
  using      (public.has_role(array['admin','storekeeper']))
  with check (public.has_role(array['admin','storekeeper']));

drop policy if exists "sba read"  on public.supplier_bill_approvals;
drop policy if exists "sba write" on public.supplier_bill_approvals;
create policy "sba read"  on public.supplier_bill_approvals
  for select using (auth.role() = 'authenticated');
create policy "sba write" on public.supplier_bill_approvals
  for all
  using      (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

drop policy if exists "gpr read"  on public.gst_purchase_reports;
drop policy if exists "gpr write" on public.gst_purchase_reports;
create policy "gpr read"  on public.gst_purchase_reports
  for select using (auth.role() = 'authenticated');
create policy "gpr write" on public.gst_purchase_reports
  for all
  using      (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

drop policy if exists "gpri read"  on public.gst_purchase_report_items;
drop policy if exists "gpri write" on public.gst_purchase_report_items;
create policy "gpri read"  on public.gst_purchase_report_items
  for select using (auth.role() = 'authenticated');
create policy "gpri write" on public.gst_purchase_report_items
  for all
  using      (public.has_role(array['admin']))
  with check (public.has_role(array['admin']));

-- =========================================================================
-- VERIFICATION — run this separately after applying.
-- Every row should return ok = true.
-- =========================================================================
--
-- with required(table_name, column_name) as (
--   values
--     ('supplier_bill_uploads',     'id'),
--     ('supplier_bill_uploads',     'supplier_tin'),
--     ('supplier_bill_uploads',     'taxable_activity_no'),
--     ('supplier_bill_uploads',     'invoice_total_excl_gst'),
--     ('supplier_bill_uploads',     'gst_charged'),
--     ('supplier_bill_uploads',     'raw_text'),
--     ('supplier_bill_uploads',     'ocr_confidence'),
--     ('supplier_bill_uploads',     'ocr_model'),
--     ('supplier_bill_uploads',     'ocr_extracted_at'),
--     ('supplier_bill_uploads',     'ocr_notes'),
--     ('supplier_bill_uploads',     'status'),
--     ('supplier_bill_items',       'upload_id'),
--     ('supplier_bill_items',       'description'),
--     ('supplier_bill_items',       'qty'),
--     ('supplier_bill_items',       'unit_price'),
--     ('supplier_bill_items',       'line_total'),
--     ('supplier_bill_items',       'gst_amount'),
--     ('supplier_bill_items',       'source'),
--     ('supplier_bill_items',       'ocr_confidence'),
--     ('supplier_bill_approvals',   'upload_id'),
--     ('supplier_bill_approvals',   'action'),
--     ('gst_purchase_reports',      'supplier_tin'),
--     ('gst_purchase_reports',      'taxable_activity_no'),
--     ('gst_purchase_reports',      'invoice_total_excl_gst'),
--     ('gst_purchase_reports',      'gst_charged'),
--     ('gst_purchase_reports',      'bill_date'),
--     ('gst_purchase_report_items', 'report_id'),
--     ('gst_purchase_report_items', 'description'),
--     ('gst_purchase_report_items', 'line_total')
-- )
-- select r.table_name, r.column_name,
--        (c.column_name is not null) as ok
-- from required r
-- left join information_schema.columns c
--   on c.table_schema = 'public'
--  and c.table_name   = r.table_name
--  and c.column_name  = r.column_name
-- order by r.table_name, r.column_name;

select
  'supplier_bill_uploads'     as table_name, to_regclass('public.supplier_bill_uploads')     is not null as exists
union all select 'supplier_bill_items',       to_regclass('public.supplier_bill_items')       is not null
union all select 'supplier_bill_approvals',   to_regclass('public.supplier_bill_approvals')   is not null
union all select 'gst_purchase_reports',      to_regclass('public.gst_purchase_reports')      is not null
union all select 'gst_purchase_report_items', to_regclass('public.gst_purchase_report_items') is not null;
