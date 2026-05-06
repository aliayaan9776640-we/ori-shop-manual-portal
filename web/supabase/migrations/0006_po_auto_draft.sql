-- =========================================================================
-- Purchase Orders: Auto-draft generation + storekeeper-edited workflow
-- Adds new statuses (auto_draft, storekeeper_edited) and transport/estimated
-- value fields for shipment-value estimates.
-- =========================================================================

-- Drop existing status check, re-create with extended set
alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in (
    'auto_draft','storekeeper_edited',
    'draft','raised','assigned','buying_in_progress',
    'waiting_approval','approved','loaded','receiving',
    'completed','rejected'
  ));

-- New columns for shipment value estimation
alter table public.purchase_orders
  add column if not exists transport_fee numeric(12,2) not null default 0;

alter table public.purchase_orders
  add column if not exists estimated_total numeric(12,2) not null default 0;
