-- Returning voters can type the same name on a new browser/device
-- and keep their existing identity only if they have not voted yet.
-- Name-only reclaim never overwrites a ballot; it is recorded for the host.

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
