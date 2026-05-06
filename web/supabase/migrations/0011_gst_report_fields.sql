-- =========================================================================
-- GST Purchase Report — restructured fields
-- Adds the 7 official columns required for the GST purchase ledger.
-- Safe to run multiple times.
-- =========================================================================

alter table public.supplier_bill_uploads
  add column if not exists supplier_tin text,
  add column if not exists taxable_activity_no text,
  add column if not exists invoice_total_excl_gst numeric(12,2) not null default 0,
  add column if not exists gst_charged numeric(12,2) not null default 0;

alter table public.gst_purchase_reports
  add column if not exists supplier_tin text,
  add column if not exists taxable_activity_no text,
  add column if not exists invoice_total_excl_gst numeric(12,2) not null default 0,
  add column if not exists gst_charged numeric(12,2) not null default 0;

-- Backfill from legacy columns if they were used previously.
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
