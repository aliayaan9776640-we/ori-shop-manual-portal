-- =========================================================================
-- 0008 — RBAC, Approval Limits, and Audit Logs
--
-- Adds:
--   * role_settings   — configurable permissions + approval limits per role
--   * audit_logs      — immutable audit trail with before/after JSON
--
-- Notes:
--   - audit_logs is append-only (no UPDATE / DELETE policies created).
--   - Existing activity_logs table is kept for human-readable activity feed.
-- =========================================================================

-- -------------------- role_settings -------------------------------------
create table if not exists public.role_settings (
  role            text primary key,
  permissions     jsonb not null default '{}'::jsonb,
  approval_limit  numeric not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);

-- Seed defaults if missing
insert into public.role_settings (role, permissions, approval_limit) values
  ('admin', jsonb_build_object(
      'can_create_purchase', true,
      'can_create_stock_entry', true,
      'can_request_approval', true,
      'can_approve', true,
      'can_override_limits', true,
      'can_view_reports', true,
      'can_edit_after_approval', true
    ), 0),
  ('storekeeper', jsonb_build_object(
      'can_create_purchase', true,
      'can_create_stock_entry', true,
      'can_request_approval', true,
      'can_approve', false,
      'can_override_limits', false,
      'can_view_reports', false,
      'can_edit_after_approval', false
    ), 5000),
  ('cashier', jsonb_build_object(
      'can_create_purchase', false,
      'can_create_stock_entry', false,
      'can_request_approval', true,
      'can_approve', false,
      'can_override_limits', false,
      'can_view_reports', false,
      'can_edit_after_approval', false
    ), 0)
on conflict (role) do nothing;

alter table public.role_settings enable row level security;

drop policy if exists "role_settings read"   on public.role_settings;
drop policy if exists "role_settings write"  on public.role_settings;

create policy "role_settings read"
  on public.role_settings for select
  using (auth.role() = 'authenticated');

create policy "role_settings write"
  on public.role_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------- audit_logs ----------------------------------------
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  entity        text not null,
  entity_id     text,
  action        text not null,         -- create | update | delete | approve | reject | other
  performed_by  uuid references public.profiles(id) on delete set null,
  performed_by_name text,
  before_value  jsonb,
  after_value   jsonb,
  reason        text,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity, entity_id, created_at desc);
create index if not exists audit_logs_performed_by_idx
  on public.audit_logs (performed_by, created_at desc);
create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs read"   on public.audit_logs;
drop policy if exists "audit_logs insert" on public.audit_logs;

-- Read: all authenticated users (admins typically; UI further restricts).
create policy "audit_logs read"
  on public.audit_logs for select
  using (auth.role() = 'authenticated');

-- Append-only: only INSERT allowed. No UPDATE / DELETE policies => denied.
create policy "audit_logs insert"
  on public.audit_logs for insert
  with check (auth.role() = 'authenticated');

-- Hard guard: prevent any update/delete even by table owner via API.
drop trigger if exists audit_logs_no_modify on public.audit_logs;
create or replace function public.audit_logs_no_modify()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;
create trigger audit_logs_no_modify
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_no_modify();
