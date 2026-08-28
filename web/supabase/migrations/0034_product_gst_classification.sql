-- Persist each product's GST classification for Inventory, POS and reports.
-- Existing products default to GST because the former application did not
-- store the Inventory form's GST/Non-GST selection in the database.

alter table public.products
  add column if not exists gst_applicable boolean;

update public.products
set gst_applicable = true
where gst_applicable is null;

alter table public.products
  alter column gst_applicable set default true,
  alter column gst_applicable set not null;

comment on column public.products.gst_applicable is
  'True when POS must charge GST for this product; false for non-GST items.';

