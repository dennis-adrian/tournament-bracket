-- Require contest-entry uploads to live under an existing contest id,
-- and periodically remove objects that have no matching contest.

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

create or replace function private.cleanup_orphan_contest_entries()
returns integer
language plpgsql
security definer
set search_path = storage, public
as $$
declare
  v_deleted integer;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects o
  where o.bucket_id = 'contest-entries'
    and not exists (
      select 1
      from public.contests c
      where c.id::text = split_part(o.name, '/', 1)
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_orphan_contest_entries() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'cleanup-orphan-contest-entries',
  '15 * * * *',
  $job$select private.cleanup_orphan_contest_entries();$job$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup-orphan-contest-entries'
);

select private.cleanup_orphan_contest_entries();
