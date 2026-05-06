-- =========================================================================
-- 0022_shop_content.sql
-- Admin-managed homepage / online shop content:
--   * shop_banners              — main hero slider images
--   * shop_ads                  — promo ads (top / middle / sidebar)
--   * shop_sections             — featured product sections (top picks,
--                                 best selling, new arrivals, ...)
--   * shop_featured_products    — products pinned to a section
--
-- Public (anon) can READ active rows. Only admin role can write.
-- Idempotent — safe to re-run.
-- =========================================================================

-- ---------- shop_banners (hero slider) ----------------------------------
create table if not exists public.shop_banners (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  subtitle     text,
  image_url    text not null,
  link_url     text,
  button_text  text,
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shop_banners_order_idx
  on public.shop_banners (active, sort_order);

-- ---------- shop_ads (promo banners) ------------------------------------
create table if not exists public.shop_ads (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  description  text,
  image_url    text,
  button_text  text,
  link_url     text,
  position     text not null default 'top'
               check (position in ('top','middle','sidebar')),
  sort_order   int  not null default 0,
  active       boolean not null default true,
  start_at     timestamptz,
  end_at       timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shop_ads_lookup_idx
  on public.shop_ads (active, position, sort_order);

-- ---------- shop_sections (homepage product rows) -----------------------
-- key is a stable identifier the storefront looks up: 'top_picks',
-- 'best_selling', 'new_arrivals', 'featured', etc.
create table if not exists public.shop_sections (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,
  title        text not null,
  subtitle     text,
  active       boolean not null default true,
  max_items    int  not null default 8,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shop_sections_order_idx
  on public.shop_sections (active, sort_order);

-- Seed a few default sections (only if the row is missing).
insert into public.shop_sections (key, title, subtitle, sort_order, max_items)
values
  ('top_picks',     'Top Picks for You', 'Hand-picked by our team',   10, 8),
  ('best_selling',  'Best Selling',      'What customers love most',  20, 8),
  ('new_arrivals',  'New Arrivals',      'Fresh on the shelves',      30, 8)
on conflict (key) do nothing;

-- ---------- shop_featured_products (section ↔ product mapping) ----------
create table if not exists public.shop_featured_products (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.shop_sections(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (section_id, product_id)
);
create index if not exists shop_featured_section_idx
  on public.shop_featured_products (section_id, sort_order);

-- ---------- updated_at trigger ------------------------------------------
create or replace function public.shop_content_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

drop trigger if exists shop_banners_touch on public.shop_banners;
create trigger shop_banners_touch  before update on public.shop_banners
  for each row execute function public.shop_content_touch();

drop trigger if exists shop_ads_touch on public.shop_ads;
create trigger shop_ads_touch      before update on public.shop_ads
  for each row execute function public.shop_content_touch();

drop trigger if exists shop_sections_touch on public.shop_sections;
create trigger shop_sections_touch before update on public.shop_sections
  for each row execute function public.shop_content_touch();

-- =========================================================================
-- RLS — public read, admin write
-- =========================================================================
alter table public.shop_banners            enable row level security;
alter table public.shop_ads                enable row level security;
alter table public.shop_sections           enable row level security;
alter table public.shop_featured_products  enable row level security;

do $$
declare r record;
begin
  for r in (
    select policyname, tablename from pg_policies
    where schemaname='public'
      and tablename in (
        'shop_banners','shop_ads','shop_sections','shop_featured_products'
      )
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end$$;

-- Public/anon read of all rows; storefront filters active+schedule client-side.
create policy "shop_banners read all"
  on public.shop_banners for select using (true);
create policy "shop_ads read all"
  on public.shop_ads     for select using (true);
create policy "shop_sections read all"
  on public.shop_sections for select using (true);
create policy "shop_featured read all"
  on public.shop_featured_products for select using (true);

-- Admin-only writes.
create policy "shop_banners admin write"
  on public.shop_banners for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "shop_ads admin write"
  on public.shop_ads for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "shop_sections admin write"
  on public.shop_sections for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "shop_featured admin write"
  on public.shop_featured_products for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =========================================================================
-- Realtime
-- =========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.shop_banners';
      exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.shop_ads';
      exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.shop_sections';
      exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.shop_featured_products';
      exception when duplicate_object then null; end;
  end if;
end$$;
