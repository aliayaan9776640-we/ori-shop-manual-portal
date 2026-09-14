-- Preserve fractional KG/gram damaged quantities so damage deductions match
-- weight-based inventory exactly.

begin;

alter table public.damaged_items
  alter column qty type numeric(14,3) using qty::numeric;

commit;
