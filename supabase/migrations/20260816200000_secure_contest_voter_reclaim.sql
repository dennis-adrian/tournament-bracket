-- Restrict name-only voter reclaim to unvoted identities, record rebinds
-- for the host, and restore unique-name errors on join_contest inserts.

alter table public.contest_voters
  add column if not exists rebound_at timestamptz;

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
  v_constraint text;
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

  select * into v_voter
  from public.contest_voters
  where contest_id = c.id
    and lower(trim(display_name)) = lower(v_name)
  for update;

  if found then
    update public.contest_voters
    set
      client_token_hash = private.hash_token(p_client_token),
      rebound_at = now()
    where id = v_voter.id
      and not exists (
        select 1
        from public.contest_votes vt
        where vt.voter_id = v_voter.id
      )
    returning * into v_voter;

    if found then
      return jsonb_build_object(
        'voter_id', v_voter.id,
        'display_name', v_voter.display_name
      );
    end if;

    raise exception 'That name is already taken';
  end if;

  begin
    insert into public.contest_voters (contest_id, display_name, client_token_hash)
    values (c.id, v_name, private.hash_token(p_client_token))
    returning * into v_voter;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if coalesce(v_constraint, sqlerrm) like '%contest_voters_name_unique%' then
        raise exception 'That name is already taken';
      end if;
      raise;
  end;

  return jsonb_build_object(
    'voter_id', v_voter.id,
    'display_name', v_voter.display_name
  );
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
  v_rebound_names jsonb := '[]'::jsonb;
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

    select coalesce(
      jsonb_agg(vr.display_name order by vr.rebound_at),
      '[]'::jsonb
    )
    into v_rebound_names
    from public.contest_voters vr
    where vr.contest_id = c.id
      and vr.rebound_at is not null;
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
    'rebound_voter_names', v_rebound_names,
    'votes', v_votes
  );
end;
$$;
