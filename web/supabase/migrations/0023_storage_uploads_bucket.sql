-- =========================================================================
-- 0023_storage_uploads_bucket.sql
-- Storage bucket "uploads" for Inventory product photos and Online Shop
-- (banners, ads, homepage images, featured product images).
--
-- - Public READ (anyone can view image URLs).
-- - Authenticated staff (admin / storekeeper / cashier / delivery)
--   can INSERT / UPDATE / DELETE objects.
-- - Customer / public users cannot upload.
-- Idempotent — safe to re-run.
-- =========================================================================

-- 1) Bucket
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

-- 2) Policies (drop & recreate to stay idempotent)
drop policy if exists "uploads public read"   on storage.objects;
drop policy if exists "uploads staff insert"  on storage.objects;
drop policy if exists "uploads staff update"  on storage.objects;
drop policy if exists "uploads staff delete"  on storage.objects;

create policy "uploads public read"
  on storage.objects for select
  using (bucket_id = 'uploads');

create policy "uploads staff insert"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','storekeeper','cashier','delivery')
    )
  );

create policy "uploads staff update"
  on storage.objects for update
  using (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','storekeeper','cashier','delivery')
    )
  )
  with check (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','storekeeper','cashier','delivery')
    )
  );

create policy "uploads staff delete"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','storekeeper','cashier','delivery')
    )
  );
