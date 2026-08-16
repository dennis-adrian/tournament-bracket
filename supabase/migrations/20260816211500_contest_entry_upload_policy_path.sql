-- Qualify storage.objects.name so the contest-id check is not bound to
-- contests.name inside the EXISTS subquery.

drop policy if exists "Anyone can upload contest images" on storage.objects;

create policy "Anyone can upload contest images"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'contest-entries'
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  and exists (
    select 1
    from public.contests c
    where c.id::text = split_part(storage.objects.name, '/', 1)
  )
);
