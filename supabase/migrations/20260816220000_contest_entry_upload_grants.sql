-- Entry uploads now need a host-minted, path-scoped grant: knowing a contest
-- id (any voter does) is no longer enough to write into its folder.

create table if not exists private.contest_upload_grants (
  object_path text primary key,
  contest_id uuid not null references public.contests(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '1 hour'
);

create index if not exists contest_upload_grants_expires_idx
  on private.contest_upload_grants (expires_at);

revoke all on table private.contest_upload_grants from public, anon, authenticated;

-- The host proves itself with its token, then gets a short-lived write grant
-- for exactly the object paths its draft entries will occupy.
create or replace function public.grant_entry_uploads(
  p_slug text,
  p_host_token text,
  p_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
  v_count integer;
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  perform private.require_host(c, p_host_token);

  if c.status <> 'draft' then
    raise exception 'Drawings can only be added before voting starts';
  end if;

  v_count := coalesce(array_length(p_entry_ids, 1), 0);
  if v_count < 1 or v_count > 20 then
    raise exception 'Add between 2 and 20 drawings';
  end if;

  delete from private.contest_upload_grants where expires_at < now();

  insert into private.contest_upload_grants (object_path, contest_id)
  select c.id::text || '/' || entry_id::text || '.jpg', c.id
  from unnest(p_entry_ids) as entry_id
  on conflict (object_path) do update
    set expires_at = now() + interval '1 hour';

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke all on function public.grant_entry_uploads(text, text, uuid[]) from public;
grant execute on function public.grant_entry_uploads(text, text, uuid[]) to anon, authenticated;

-- Security definer so the storage policy can read the grants table without
-- exposing it to anon.
create or replace function public.contest_upload_allowed(p_path text)
returns boolean
language sql
security definer
stable
set search_path = private, public
as $$
  select exists (
    select 1
    from private.contest_upload_grants g
    where g.object_path = p_path
      and g.expires_at > now()
  );
$$;

revoke all on function public.contest_upload_allowed(text) from public;
grant execute on function public.contest_upload_allowed(text) to anon, authenticated;

drop policy if exists "Anyone can upload contest images" on storage.objects;
drop policy if exists "Hosts can upload contest images" on storage.objects;

create policy "Hosts can upload contest images"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'contest-entries'
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  and public.contest_upload_allowed(storage.objects.name)
);

-- Also reap images left behind when a host drops an entry before saving:
-- the grace period keeps uploads that are still mid-flight.
-- NOTE: this deletes storage metadata rows only; the bytes in the object
-- store are reclaimed by Storage's own orphan sweep.
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

  delete from private.contest_upload_grants where expires_at < now();

  delete from storage.objects o
  where o.bucket_id = 'contest-entries'
    and (
      not exists (
        select 1
        from public.contests c
        where c.id::text = split_part(o.name, '/', 1)
      )
      or (
        o.created_at < now() - interval '1 day'
        and not exists (
          select 1
          from public.contest_entries e
          where e.image_path = o.name
        )
      )
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_orphan_contest_entries() from public, anon, authenticated;
