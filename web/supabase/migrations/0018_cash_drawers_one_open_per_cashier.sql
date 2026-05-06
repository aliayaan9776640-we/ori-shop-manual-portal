-- =========================================================================
-- 0018_cash_drawers_one_open_per_cashier.sql
--
-- Per-cashier rule for cash drawers:
--   * Each cashier may have at most ONE open drawer at a time.
--   * Multiple cashiers may have their own open drawers in parallel.
--
-- This migration matches the current Supabase database state. The
-- cash_drawers table only has the following columns relevant here:
--   id, cashier_id, status, opened_at, closed_at, created_at
-- It does NOT have close_reason, closed_by, or closed_by_name.
--
-- The migration is fully idempotent and will NOT overwrite the existing
-- per-cashier partial unique index.
-- =========================================================================

-- 1. Close any duplicate open drawers, keeping only the most recently
--    opened drawer per cashier. Older duplicates are marked closed so the
--    per-cashier unique index can hold without conflicts.
with ranked as (
  select id,
         cashier_id,
         row_number() over (
           partition by cashier_id
           order by coalesce(opened_at, created_at, now()) desc, id desc
         ) as rn
    from public.cash_drawers
   where status = 'open'
     and cashier_id is not null
)
update public.cash_drawers cd
   set status    = 'closed',
       closed_at = coalesce(cd.closed_at, now())
  from ranked r
 where cd.id = r.id
   and r.rn > 1;

-- Edge case: any open drawer with a NULL cashier_id can't satisfy a
-- per-cashier index — close them as well.
update public.cash_drawers
   set status    = 'closed',
       closed_at = coalesce(closed_at, now())
 where status = 'open'
   and cashier_id is null;

-- 2. Drop the previous shop-wide partial unique index from 0017 if present.
--    Do NOT drop the per-cashier index — it already exists in production.
drop index if exists public.cash_drawers_single_open_idx;

-- 3. Enforce: only one OPEN drawer per cashier.
--    Use IF NOT EXISTS so we never overwrite the existing index.
create unique index if not exists cash_drawers_one_open_per_cashier
  on public.cash_drawers (cashier_id)
  where status = 'open';
