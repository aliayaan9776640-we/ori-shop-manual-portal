-- Make exposed views respect the caller's grants and underlying RLS policies.
-- Preserve the storefront's anonymous product catalogue access.

do $migration$
begin
  if to_regclass('public.public_products') is not null then
    execute 'alter view public.public_products set (security_invoker = true)';
    execute 'revoke all privileges on public.public_products from public, anon, authenticated';
    execute 'grant select on public.public_products to anon, authenticated';
  end if;

  if to_regclass('public.online_customer_credit_matches') is not null then
    execute 'alter view public.online_customer_credit_matches set (security_invoker = true)';
    execute 'revoke all privileges on public.online_customer_credit_matches from public, anon, authenticated';
    execute 'grant select on public.online_customer_credit_matches to authenticated';
  end if;
end
$migration$;

