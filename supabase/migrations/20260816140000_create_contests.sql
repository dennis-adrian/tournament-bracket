-- Contest voting: public share links, named voters, timed rounds.
-- All data access goes through SECURITY DEFINER RPCs. Tables have RLS
-- enabled with no policies, so the Data API cannot read or write rows.

create schema if not exists private;
create schema if not exists extensions;

-- digest() and gen_random_bytes() below come from pgcrypto.
create extension if not exists pgcrypto with schema extensions;

create or replace function private.hash_token(p_token text)
returns bytea
language sql
immutable
parallel safe
set search_path = extensions, pg_catalog
as $$
  select digest(convert_to(p_token, 'utf8'), 'sha256');
$$;

create type public.voting_system as enum ('plurality', 'approval', 'ranked');
create type public.contest_status as enum ('draft', 'open', 'closed');

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  voting_system public.voting_system not null,
  duration_minutes integer not null,
  status public.contest_status not null default 'draft',
  host_token_hash bytea not null,
  starts_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contests_name_len check (char_length(trim(name)) between 1 and 80),
  constraint contests_duration_range check (duration_minutes between 1 and 180)
);

create table public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  name text not null,
  image_path text not null,
  sort_order integer not null,
  constraint contest_entries_name_len check (char_length(trim(name)) between 1 and 80),
  constraint contest_entries_sort unique (contest_id, sort_order)
);

create table public.contest_voters (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  display_name text not null,
  client_token_hash bytea not null,
  created_at timestamptz not null default now(),
  constraint contest_voters_name_len check (char_length(trim(display_name)) between 1 and 40),
  constraint contest_voters_token unique (contest_id, client_token_hash)
);

create unique index contest_voters_name_unique
  on public.contest_voters (contest_id, lower(trim(display_name)));

create table public.contest_votes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  voter_id uuid not null references public.contest_voters (id) on delete cascade,
  entry_id uuid not null references public.contest_entries (id) on delete cascade,
  rank integer not null check (rank >= 1),
  constraint contest_votes_entry unique (contest_id, voter_id, entry_id)
);

create index contest_entries_contest_id_idx on public.contest_entries (contest_id);
create index contest_voters_contest_id_idx on public.contest_voters (contest_id);
create index contest_votes_contest_id_idx on public.contest_votes (contest_id);
create index contest_votes_voter_id_idx on public.contest_votes (voter_id);

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_voters enable row level security;
alter table public.contest_votes enable row level security;

revoke all on public.contests from anon, authenticated, public;
revoke all on public.contest_entries from anon, authenticated, public;
revoke all on public.contest_voters from anon, authenticated, public;
revoke all on public.contest_votes from anon, authenticated, public;

create or replace function private.refresh_contest(p_id uuid)
returns public.contests
language plpgsql
set search_path = public
as $$
declare
  c public.contests;
begin
  update public.contests
  set status = 'closed'
  where id = p_id
    and status = 'open'
    and closes_at is not null
    and closes_at <= now();

  select * into strict c from public.contests where id = p_id;
  return c;
end;
$$;

create or replace function private.require_host(p_contest public.contests, p_host_token text)
returns void
language plpgsql
set search_path = public, private
as $$
begin
  if p_host_token is null or char_length(p_host_token) < 16 then
    raise exception 'Host token required';
  end if;
  if p_contest.host_token_hash <> private.hash_token(p_host_token) then
    raise exception 'Invalid host token';
  end if;
end;
$$;

create or replace function public.create_contest(
  p_name text,
  p_voting_system text,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_slug text;
  v_token text;
  v_id uuid;
  v_system public.voting_system;
begin
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 80 then
    raise exception 'Contest name must be between 1 and 80 characters';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 180 then
    raise exception 'Duration must be between 1 and 180 minutes';
  end if;

  begin
    v_system := p_voting_system::public.voting_system;
  exception
    when invalid_text_representation then
      raise exception 'Invalid voting system';
  end;

  v_token := encode(gen_random_bytes(24), 'hex');

  for i in 1..8 loop
    v_slug := encode(gen_random_bytes(5), 'hex');
    begin
      insert into public.contests (
        slug, name, voting_system, duration_minutes, host_token_hash
      )
      values (
        v_slug, trim(p_name), v_system, p_duration_minutes, private.hash_token(v_token)
      )
      returning id into v_id;
      exit;
    exception
      when unique_violation then
        if i = 8 then
          raise exception 'Could not allocate a unique link';
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'slug', v_slug,
    'host_token', v_token
  );
end;
$$;

create or replace function public.add_contest_entries(
  p_slug text,
  p_host_token text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
  v_count integer;
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_path text;
  v_order integer;
  v_seen_ids uuid[] := '{}';
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  perform private.require_host(c, p_host_token);
  if c.status <> 'draft' then
    raise exception 'Drawings can only be added before voting starts';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Entries must be an array';
  end if;
  v_count := jsonb_array_length(p_entries);
  if v_count < 2 or v_count > 20 then
    raise exception 'Add between 2 and 20 drawings';
  end if;

  delete from public.contest_entries where contest_id = c.id;

  for v_item in select * from jsonb_array_elements(p_entries)
  loop
    begin
      v_id := (v_item->>'id')::uuid;
    exception
      when others then
        raise exception 'Each drawing needs a valid id';
    end;
    if v_id = any (v_seen_ids) then
      raise exception 'Duplicate drawing id';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_id);

    v_name := trim(v_item->>'name');
    if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
      raise exception 'Each drawing needs a name';
    end if;

    v_path := v_item->>'image_path';
    if v_path is null or v_path not like (c.id::text || '/%') or v_path like '%..%' then
      raise exception 'Invalid image path';
    end if;

    begin
      v_order := (v_item->>'sort_order')::integer;
    exception
      when others then
        raise exception 'Each drawing needs a sort order';
    end;

    insert into public.contest_entries (id, contest_id, name, image_path, sort_order)
    values (v_id, c.id, v_name, v_path, v_order);
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

create or replace function public.start_contest(
  p_slug text,
  p_host_token text
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
    raise exception 'Voting has already started';
  end if;

  select count(*) into v_count from public.contest_entries where contest_id = c.id;
  if v_count < 2 then
    raise exception 'Add at least 2 drawings before starting';
  end if;

  update public.contests
  set
    status = 'open',
    starts_at = now(),
    closes_at = now() + (c.duration_minutes * interval '1 minute')
  where id = c.id
  returning * into c;

  return jsonb_build_object(
    'status', c.status,
    'starts_at', c.starts_at,
    'closes_at', c.closes_at
  );
end;
$$;

create or replace function public.close_contest(
  p_slug text,
  p_host_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  perform private.require_host(c, p_host_token);

  if c.status = 'draft' then
    raise exception 'Voting has not started';
  end if;

  if c.status = 'open' then
    update public.contests
    set status = 'closed', closes_at = now()
    where id = c.id
    returning * into c;
  end if;

  return jsonb_build_object('status', c.status, 'closes_at', c.closes_at);
end;
$$;

create or replace function public.join_contest(
  p_slug text,
  p_display_name text,
  p_client_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
  v_name text;
  v_voter public.contest_voters;
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  c := private.refresh_contest(c.id);

  if c.status = 'closed' then
    raise exception 'Voting is closed';
  end if;
  if p_client_token is null or char_length(p_client_token) < 16 then
    raise exception 'Missing voter token';
  end if;

  v_name := trim(p_display_name);
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Name must be between 1 and 40 characters';
  end if;

  select * into v_voter
  from public.contest_voters
  where contest_id = c.id
    and client_token_hash = private.hash_token(p_client_token);

  if found then
    return jsonb_build_object(
      'voter_id', v_voter.id,
      'display_name', v_voter.display_name
    );
  end if;

  begin
    insert into public.contest_voters (contest_id, display_name, client_token_hash)
    values (c.id, v_name, private.hash_token(p_client_token))
    returning * into v_voter;
  exception
    when unique_violation then
      raise exception 'That name is already taken';
  end;

  return jsonb_build_object(
    'voter_id', v_voter.id,
    'display_name', v_voter.display_name
  );
end;
$$;

create or replace function public.submit_votes(
  p_slug text,
  p_client_token text,
  p_votes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
  v_voter public.contest_voters;
  v_entry_ids uuid[];
  v_n integer;
  v_item jsonb;
  v_entry uuid;
  v_rank integer;
  v_seen uuid[] := '{}';
  v_ranks integer[] := '{}';
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  c := private.refresh_contest(c.id);

  if c.status <> 'open' then
    raise exception 'Voting is not open';
  end if;
  if p_client_token is null or char_length(p_client_token) < 16 then
    raise exception 'Missing voter token';
  end if;
  if p_votes is null or jsonb_typeof(p_votes) <> 'array' then
    raise exception 'Votes must be an array';
  end if;

  select * into v_voter
  from public.contest_voters
  where contest_id = c.id
    and client_token_hash = private.hash_token(p_client_token);
  if not found then
    raise exception 'Join with your name before voting';
  end if;

  if exists (select 1 from public.contest_votes where voter_id = v_voter.id) then
    raise exception 'You have already voted';
  end if;

  select array_agg(id order by sort_order)
  into v_entry_ids
  from public.contest_entries
  where contest_id = c.id;
  v_n := coalesce(array_length(v_entry_ids, 1), 0);

  if c.voting_system = 'plurality' then
    if jsonb_array_length(p_votes) <> 1 then
      raise exception 'Pick exactly one drawing';
    end if;
  elsif c.voting_system = 'approval' then
    if jsonb_array_length(p_votes) < 1 or jsonb_array_length(p_votes) > v_n then
      raise exception 'Pick at least one drawing';
    end if;
  elsif c.voting_system = 'ranked' then
    if jsonb_array_length(p_votes) <> v_n then
      raise exception 'Rank every drawing';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_votes)
  loop
    begin
      v_entry := (v_item->>'entry_id')::uuid;
      v_rank := (v_item->>'rank')::integer;
    exception
      when others then
        raise exception 'Invalid vote';
    end;
    if v_entry is null or not (v_entry = any (v_entry_ids)) then
      raise exception 'Invalid drawing';
    end if;
    if v_entry = any (v_seen) then
      raise exception 'Duplicate drawing in ballot';
    end if;
    v_seen := array_append(v_seen, v_entry);

    if c.voting_system = 'ranked' then
      if v_rank < 1 or v_rank > v_n or v_rank = any (v_ranks) then
        raise exception 'Ranks must be a unique 1…n ordering';
      end if;
    else
      if v_rank <> 1 then
        raise exception 'Invalid rank';
      end if;
    end if;
    v_ranks := array_append(v_ranks, v_rank);
  end loop;

  insert into public.contest_votes (contest_id, voter_id, entry_id, rank)
  select c.id, v_voter.id, (item->>'entry_id')::uuid, (item->>'rank')::integer
  from jsonb_array_elements(p_votes) as item;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_contest(
  p_slug text,
  p_host_token text default null,
  p_client_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.contests;
  v_is_host boolean := false;
  v_voter public.contest_voters;
  v_has_voted boolean := false;
  v_entries jsonb;
  v_voter_count integer;
  v_voter_names jsonb := '[]'::jsonb;
  v_votes jsonb := null;
begin
  select * into c from public.contests where slug = p_slug;
  if not found then
    raise exception 'Contest not found';
  end if;
  c := private.refresh_contest(c.id);

  if p_host_token is not null and char_length(p_host_token) >= 16 then
    v_is_host := c.host_token_hash = private.hash_token(p_host_token);
  end if;

  if p_client_token is not null and char_length(p_client_token) >= 16 then
    select * into v_voter
    from public.contest_voters
    where contest_id = c.id
      and client_token_hash = private.hash_token(p_client_token);
    if found then
      v_has_voted := exists (
        select 1 from public.contest_votes where voter_id = v_voter.id
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'image_path', e.image_path,
        'sort_order', e.sort_order
      )
      order by e.sort_order
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.contest_entries e
  where e.contest_id = c.id;

  select count(*) into v_voter_count
  from public.contest_voters
  where contest_id = c.id;

  if v_is_host then
    select coalesce(
      jsonb_agg(vr.display_name order by vr.created_at),
      '[]'::jsonb
    )
    into v_voter_names
    from public.contest_voters vr
    where vr.contest_id = c.id;
  end if;

  if v_is_host or c.status = 'closed' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'entry_id', vt.entry_id,
          'rank', vt.rank,
          'voter_id', vt.voter_id,
          'voter_name', case when v_is_host then vr.display_name else null end
        )
      ),
      '[]'::jsonb
    )
    into v_votes
    from public.contest_votes vt
    join public.contest_voters vr on vr.id = vt.voter_id
    where vt.contest_id = c.id;
  end if;

  return jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name,
    'voting_system', c.voting_system,
    'duration_minutes', c.duration_minutes,
    'status', c.status,
    'starts_at', c.starts_at,
    'closes_at', c.closes_at,
    'is_host', v_is_host,
    'has_voted', v_has_voted,
    'voter_name', v_voter.display_name,
    'entries', v_entries,
    'voter_count', v_voter_count,
    'voter_names', v_voter_names,
    'votes', v_votes
  );
end;
$$;

revoke all on function public.create_contest(text, text, integer) from public;
revoke all on function public.add_contest_entries(text, text, jsonb) from public;
revoke all on function public.start_contest(text, text) from public;
revoke all on function public.close_contest(text, text) from public;
revoke all on function public.join_contest(text, text, text) from public;
revoke all on function public.submit_votes(text, text, jsonb) from public;
revoke all on function public.get_contest(text, text, text) from public;

grant execute on function public.create_contest(text, text, integer) to anon, authenticated;
grant execute on function public.add_contest_entries(text, text, jsonb) to anon, authenticated;
grant execute on function public.start_contest(text, text) to anon, authenticated;
grant execute on function public.close_contest(text, text) to anon, authenticated;
grant execute on function public.join_contest(text, text, text) to anon, authenticated;
grant execute on function public.submit_votes(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_contest(text, text, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contest-entries',
  'contest-entries',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Anyone can upload contest images"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'contest-entries'
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
);
