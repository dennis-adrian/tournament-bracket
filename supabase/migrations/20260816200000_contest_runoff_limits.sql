-- Cap runoff rounds, serialize resolution with FOR UPDATE, and let
-- close_contest force-finalize a tie as co-winners.

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
