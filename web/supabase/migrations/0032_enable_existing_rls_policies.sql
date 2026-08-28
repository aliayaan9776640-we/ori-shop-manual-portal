-- Permanently activate existing RLS policies that are currently disabled.
-- This does not replace or change any policy. It only turns enforcement on.
-- Safe to run repeatedly.

do $migration$
declare
  target record;
begin
  for target in
    select distinct n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity = false
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.table_name
    );
  end loop;
end
$migration$;

