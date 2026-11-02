-- Teammates, part 2: the requester can cancel ("uninvite") a pending request,
-- and a link can carry an optional project name.
--
-- Cancel deletes the pending link (so it is not a decline and starts no
-- cooldown) and its tokens. So that the recipient's old email link can say
-- "this request was cancelled" rather than "invalid", the hashes of its
-- tokens are kept in teammate_cancelled_tokens with who they were for. That
-- table, like teammate_tokens, has no member grants.
--
-- Project: one label per link (still one row per pair), at most 60
-- characters, no control or bidi-override characters, never blank. The app
-- cleans it first (cleanProject() in lib/teammates/rules.ts);
-- request_teammate() cleans it again and the check constraint backs both up.

-- ─── Project name ───────────────────────────────────────────────────────────

alter table public.teammate_links
  add column project text
  constraint teammate_links_project_check check (
    project is null or (
      char_length(project) between 1 and 60
      and project ~ '\S'
      and project !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩]'
    )
  );

/** Trims, turns tabs/newlines into spaces, strips control and bidi characters; '' → null. Internal. */
create function public.teammate_clean_project(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(p, '[\t\n\r]+', ' ', 'g'),
        '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩]', '', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    ),
    ''
  );
$$;
revoke all on function public.teammate_clean_project(text) from public, anon, authenticated;

-- request_teammate gains p_project. Dropped and recreated (not overloaded) so
-- a one-argument call can't be ambiguous; p_project defaults to null, so the
-- old call shape keeps working during a deploy.
drop function public.request_teammate(uuid);

/**
 * The caller asks p_recipient to be teammates, optionally naming the project.
 * Returns {result, link_id}:
 *   pending           new request (the app then emails the recipient)
 *   confirmed         they had already asked the caller, so it's mutual now
 *                     (their project name stays; the caller's fills a blank)
 *   self / not_roster / already_teammates / already_pending / cooldown
 *   project_too_long  over 60 characters after cleaning
 * Requests for the same pair are serialized, so two people asking each other
 * at the same moment end up confirmed rather than with two rows.
 */
create function public.request_teammate(p_recipient uuid, p_project text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  proj text := public.teammate_clean_project(p_project);
  l public.teammate_links%rowtype;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  if p_recipient = me then
    return jsonb_build_object('result', 'self');
  end if;
  if char_length(proj) > 60 then
    return jsonb_build_object('result', 'project_too_long');
  end if;
  if not public.teammate_eligible(p_recipient) then
    return jsonb_build_object('result', 'not_roster');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'teammates:' || least(me, p_recipient)::text || greatest(me, p_recipient)::text, 0
  ));

  select * into l from public.teammate_links t
  where least(t.requester_id, t.recipient_id) = least(me, p_recipient)
    and greatest(t.requester_id, t.recipient_id) = greatest(me, p_recipient)
  for update;

  if not found then
    insert into public.teammate_links (requester_id, recipient_id, project)
    values (me, p_recipient, proj)
    returning * into l;
    return jsonb_build_object('result', 'pending', 'link_id', l.id);
  end if;

  if l.status = 'confirmed' then
    return jsonb_build_object('result', 'already_teammates', 'link_id', l.id);
  end if;

  if l.status = 'pending' then
    if l.requester_id = me then
      return jsonb_build_object('result', 'already_pending', 'link_id', l.id);
    end if;
    -- They already asked me: that's both of us agreeing.
    update public.teammate_links
    set status = 'confirmed', responded_at = now(),
        project = coalesce(project, proj)
    where id = l.id;
    update public.teammate_tokens tt set used_at = now()
    where tt.link_id = l.id and tt.used_at is null;
    return jsonb_build_object('result', 'confirmed', 'link_id', l.id);
  end if;

  -- Declined. The person who was turned down waits 30 days.
  if l.requester_id = me and l.responded_at > now() - interval '30 days' then
    return jsonb_build_object(
      'result', 'cooldown',
      'until', l.responded_at + interval '30 days'
    );
  end if;
  delete from public.teammate_tokens tt where tt.link_id = l.id;
  update public.teammate_links
  set requester_id = me, recipient_id = p_recipient, status = 'pending',
      created_at = now(), responded_at = null,
      email_status = null, email_sent_at = null, project = proj
  where id = l.id;
  return jsonb_build_object('result', 'pending', 'link_id', l.id);
end;
$$;

-- ─── Cancel ─────────────────────────────────────────────────────────────────

create table public.teammate_cancelled_tokens (
  token_hash    text primary key,  -- sha256 hex, as in teammate_tokens
  recipient_id  uuid not null references public.members (id) on delete cascade,
  expires_at    timestamptz not null,
  cancelled_at  timestamptz not null default now()
);
alter table public.teammate_cancelled_tokens enable row level security;
revoke all on public.teammate_cancelled_tokens from anon, authenticated;
grant all on public.teammate_cancelled_tokens to service_role;

/**
 * The requester withdraws a pending request. The link and its tokens are
 * deleted, whether or not the email went out; nothing records a decline, so
 * either person can ask again at once. Returns {result}:
 *   cancelled (+ other_id)
 *   already_teammates   they accepted first
 *   not_found           not pending, or not the caller's request
 */
create function public.cancel_teammate_request(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  l public.teammate_links%rowtype;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  -- Same row lock as respond_teammate(), so a simultaneous accept and cancel
  -- can't both win.
  select * into l from public.teammate_links
  where id = p_link_id and requester_id = me
  for update;
  if not found or l.status = 'declined' then
    -- (A requester is never told they were declined.)
    return jsonb_build_object('result', 'not_found');
  end if;
  if l.status = 'confirmed' then
    return jsonb_build_object('result', 'already_teammates');
  end if;

  insert into public.teammate_cancelled_tokens (token_hash, recipient_id, expires_at)
  select tt.token_hash, l.recipient_id, tt.expires_at
  from public.teammate_tokens tt
  where tt.link_id = l.id
  on conflict (token_hash) do nothing;
  delete from public.teammate_links where id = l.id;  -- tokens cascade
  -- Housekeeping: links that expired long ago don't need a friendly message.
  delete from public.teammate_cancelled_tokens
  where expires_at < now() - interval '30 days';
  return jsonb_build_object('result', 'cancelled', 'other_id', l.recipient_id);
end;
$$;

-- ─── Token status: knows about cancelled requests and the project ──────────

/**
 * What an email link points at, without using it up. Returns {result}:
 *   ok          pending, addressed to the caller, unused, unexpired
 *   cancelled   the requester withdrew it (only told to the recipient)
 *   invalid     no such token (or the request was removed)
 *   not_yours   addressed to someone else (no names given)
 *   used        already used, or the request was already answered
 *   expired
 * plus requester_id / requester_name / status / project when it's the caller's.
 */
create or replace function public.teammate_token_status(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  tk public.teammate_tokens%rowtype;
  l public.teammate_links%rowtype;
  gone uuid;
  who text;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  select * into tk from public.teammate_tokens where token_hash = p_token_hash;
  if not found then
    select recipient_id into gone from public.teammate_cancelled_tokens
    where token_hash = p_token_hash;
    if gone is null then
      return jsonb_build_object('result', 'invalid');
    end if;
    return jsonb_build_object(
      'result', case when gone = me then 'cancelled' else 'not_yours' end
    );
  end if;
  select * into l from public.teammate_links where id = tk.link_id;
  if l.recipient_id <> me then
    return jsonb_build_object('result', 'not_yours');
  end if;
  select display_name into who from public.members where id = l.requester_id;
  return jsonb_build_object(
    'result', case
      when tk.used_at is not null or l.status <> 'pending' then 'used'
      when tk.expires_at <= now() then 'expired'
      else 'ok'
    end,
    'link_id', l.id,
    'status', l.status,
    'requester_id', l.requester_id,
    'requester_name', who,
    'project', l.project
  );
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function
  public.request_teammate(uuid, text),
  public.cancel_teammate_request(uuid)
from public, anon;
grant execute on function
  public.request_teammate(uuid, text),
  public.cancel_teammate_request(uuid)
to authenticated;
