-- Runoff rounds: a first-place tie opens a new timed round with only
-- the tied drawings. Votes are stored per round so people vote again.

alter table public.contests
  add column if not exists round integer not null default 1,
  add column if not exists active_entry_ids uuid[];

alter table public.contests
  drop constraint if exists contests_round_min;
alter table public.contests
  add constraint contests_round_min check (round >= 1);

alter table public.contest_votes
  add column if not exists round integer not null default 1;

alter table public.contest_votes
  drop constraint if exists contest_votes_entry;

alter table public.contest_votes
  add constraint contest_votes_entry unique (contest_id, voter_id, entry_id, round);

create or replace function private.contest_active_ids(c public.contests)
returns uuid[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if c.active_entry_ids is not null and coalesce(array_length(c.active_entry_ids, 1), 0) >= 2 then
    return c.active_entry_ids;
  end if;
  select array_agg(id order by sort_order)
  into v_ids
  from public.contest_entries
  where contest_id = c.id;
  return coalesce(v_ids, '{}');
end;
$$;

drop function if exists private.resolve_open_contest(uuid);

create or replace function private.resolve_open_contest(
  p_id uuid,
  p_force boolean default false
)
returns public.contests
language plpgsql
set search_path = public
as $$
declare
  c public.contests;
  v_active uuid[];
  v_tied uuid[];
  v_max integer;
  v_max_rounds constant integer := 5;
begin
  select * into strict c from public.contests where id = p_id for update;

  if c.status <> 'open' then
    return c;
  end if;
  if not p_force and (c.closes_at is null or c.closes_at > now()) then
    return c;
  end if;

  v_active := private.contest_active_ids(c);

  with counts as (
    select active_id as entry_id, count(vt.id)::integer as n
    from unnest(v_active) as active_id
    left join public.contest_votes vt
      on vt.entry_id = active_id
     and vt.contest_id = c.id
     and vt.round = c.round
     and (c.voting_system <> 'ranked' or vt.rank = 1)
    group by active_id
  )
  select coalesce(max(n), 0) into v_max from counts;

  if v_max = 0 then
    update public.contests
    set status = 'closed'
    where id = c.id
    returning * into c;
    return c;
  end if;

  select coalesce(array_agg(entry_id), '{}')
  into v_tied
  from (
    select active_id as entry_id, count(vt.id)::integer as n
    from unnest(v_active) as active_id
    left join public.contest_votes vt
      on vt.entry_id = active_id
     and vt.contest_id = c.id
     and vt.round = c.round
     and (c.voting_system <> 'ranked' or vt.rank = 1)
    group by active_id
  ) counts
  where n = v_max;

  if coalesce(array_length(v_tied, 1), 0) <= 1 then
    update public.contests
    set status = 'closed'
    where id = c.id
    returning * into c;
    return c;
  end if;

  -- Host force-close and the round cap both end a tie as co-winners.
  if p_force or c.round >= v_max_rounds then
    update public.contests
    set
      status = 'closed',
      active_entry_ids = v_tied
    where id = c.id
    returning * into c;
    return c;
  end if;

  update public.contests
  set
    round = c.round + 1,
    active_entry_ids = v_tied,
    starts_at = now(),
    closes_at = now() + (c.duration_minutes * interval '1 minute'),
    status = 'open'
  where id = c.id
  returning * into c;

  return c;
end;
$$;

create or replace function private.refresh_contest(p_id uuid)
returns public.contests
language plpgsql
set search_path = public
as $$
begin
  return private.resolve_open_contest(p_id);
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
    round = 1,
    active_entry_ids = null,
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
    set closes_at = now()
    where id = c.id;
  end if;

  c := private.resolve_open_contest(c.id, true);

  return jsonb_build_object(
    'status', c.status,
    'closes_at', c.closes_at,
    'round', c.round
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

  if exists (
    select 1
    from public.contest_votes
    where voter_id = v_voter.id
      and round = c.round
  ) then
    raise exception 'You have already voted';
  end if;

  v_entry_ids := private.contest_active_ids(c);
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

  insert into public.contest_votes (contest_id, voter_id, entry_id, rank, round)
  select c.id, v_voter.id, (item->>'entry_id')::uuid, (item->>'rank')::integer, c.round
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
        select 1
        from public.contest_votes
        where voter_id = v_voter.id
          and round = c.round
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
    where vt.contest_id = c.id
      and vt.round = c.round;
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
    'round', c.round,
    'active_entry_ids', to_jsonb(private.contest_active_ids(c)),
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
