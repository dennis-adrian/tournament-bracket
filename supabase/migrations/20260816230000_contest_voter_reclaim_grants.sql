-- Name-only reclaim was a takeover: anyone with the share link who knew a
-- voter's name could rebind that identity to their own token and vote as them,
-- as long as the real voter had not voted yet. Reclaim now needs a short-lived
-- grant minted by the host for that exact voter. New voters are unaffected.

create table if not exists private.contest_reclaim_grants (
  voter_id uuid primary key references public.contest_voters(id) on delete cascade,
  contest_id uuid not null references public.contests(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

create index if not exists contest_reclaim_grants_expires_idx
  on private.contest_reclaim_grants (expires_at);

revoke all on table private.contest_reclaim_grants from public, anon, authenticated;

-- The host proves itself with its token, then authorises one named voter to
-- rejoin from a new device. Refused once that voter has a ballot: a cast vote
-- is never up for grabs.
create or replace function public.grant_voter_reclaim(
  p_slug text,
  p_host_token text,
  p_voter_name text
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
  perform private.require_host(c, p_host_token);

  v_name := trim(coalesce(p_voter_name, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Name must be between 1 and 40 characters';
  end if;

  select * into v_voter
  from public.contest_voters
  where contest_id = c.id
    and lower(trim(display_name)) = lower(v_name);
  if not found then
    raise exception 'That person has not joined yet';
  end if;

  if exists (
    select 1 from public.contest_votes vt where vt.voter_id = v_voter.id
  ) then
    raise exception 'That person already voted';
  end if;

  delete from private.contest_reclaim_grants where expires_at < now();

  insert into private.contest_reclaim_grants (voter_id, contest_id)
  values (v_voter.id, c.id)
  on conflict (voter_id) do update
    set expires_at = now() + interval '10 minutes';

  return jsonb_build_object('ok', true, 'display_name', v_voter.display_name);
end;
$$;

revoke all on function public.grant_voter_reclaim(text, text, text) from public;
grant execute on function public.grant_voter_reclaim(text, text, text) to anon, authenticated;

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
    -- Rebind only with a live host grant, and only while no ballot exists.
    update public.contest_voters v
    set
      client_token_hash = private.hash_token(p_client_token),
      rebound_at = now()
    where v.id = v_voter.id
      and not exists (
        select 1
        from public.contest_votes vt
        where vt.voter_id = v.id
      )
      and exists (
        select 1
        from private.contest_reclaim_grants g
        where g.voter_id = v.id
          and g.expires_at > now()
      )
    returning * into v_voter;

    if found then
      -- One grant, one rejoin.
      delete from private.contest_reclaim_grants where voter_id = v_voter.id;
      return jsonb_build_object(
        'voter_id', v_voter.id,
        'display_name', v_voter.display_name
      );
    end if;

    raise exception 'Ask the host to let you rejoin with that name';
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
