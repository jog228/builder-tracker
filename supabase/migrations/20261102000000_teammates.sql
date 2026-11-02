-- Teammates: builders mark who they build with. A link is real only once both
-- agree. One row per pair (either direction):
--   pending   → requester asked, recipient hasn't answered
--   confirmed → both agreed; shows on both profiles
--   declined  → recipient said no; hidden everywhere. The requester can't ask
--               the same person again for 30 days (the recipient can ask back
--               any time, which flips the row's direction).
-- Removing a confirmed teammate deletes the row (gone from both profiles).
--
-- Every write goes through the security-definer RPCs below, which check the
-- caller via current_member_id(); authenticated users can only select, and
-- RLS hides pending rows from everyone but the two people involved.
--
-- Email confirm/decline links carry a random token. Only its sha256 is stored
-- (teammate_tokens), single-use, expiring. That table has no grants or
-- policies: the app writes it with the secret key (lib/teammates/invite.ts)
-- and members reach it only through the token RPCs, which also require being
-- signed in as the recipient.

create table public.teammate_links (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references public.members (id) on delete cascade,
  recipient_id   uuid not null references public.members (id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'declined')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  -- Last invite email attempt (null = not tried yet). 'failed' offers "Resend".
  email_status   text check (email_status in ('sent', 'failed')),
  email_sent_at  timestamptz,
  check (requester_id <> recipient_id)
);

-- One row per pair, whichever way round (also stops duplicate requests).
create unique index teammate_links_pair on public.teammate_links (
  least(requester_id, recipient_id), greatest(requester_id, recipient_id)
);
create index teammate_links_recipient_idx on public.teammate_links (recipient_id);

create table public.teammate_tokens (
  token_hash  text primary key,  -- sha256 hex of the token in the email link
  link_id     uuid not null references public.teammate_links (id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index teammate_tokens_link_idx on public.teammate_tokens (link_id);

-- ─── Privileges and RLS ─────────────────────────────────────────────────────

alter table public.teammate_links enable row level security;
alter table public.teammate_tokens enable row level security;
revoke all on public.teammate_links, public.teammate_tokens from anon, authenticated;
grant select on public.teammate_links to authenticated;
grant all on public.teammate_links, public.teammate_tokens to service_role;

create policy "members read" on public.teammate_links
  for select to authenticated
  using (
    (select public.is_member())
    and (
      status = 'confirmed'
      or (
        status = 'pending'
        and (select public.current_member_id()) in (requester_id, recipient_id)
      )
    )
  );

-- ─── Helpers ────────────────────────────────────────────────────────────────

/** On the roster: active and allowed to log in (has an email). Internal. */
create function public.teammate_eligible(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where id = p_member and active and email is not null
  );
$$;
revoke all on function public.teammate_eligible(uuid) from public, anon, authenticated;

/**
 * Who the caller may add: roster members other than themselves, minus anyone
 * already confirmed or pending with them, and anyone who declined the
 * caller's request in the last 30 days. Never returns emails.
 */
create function public.teammate_candidates()
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.display_name, m.avatar_url
  from public.members m
  where public.is_member()
    and m.active and m.email is not null
    and m.id <> public.current_member_id()
    and not exists (
      select 1 from public.teammate_links t
      where least(t.requester_id, t.recipient_id) = least(m.id, public.current_member_id())
        and greatest(t.requester_id, t.recipient_id) = greatest(m.id, public.current_member_id())
        and (
          t.status in ('pending', 'confirmed')
          or (
            t.requester_id = public.current_member_id()
            and t.responded_at > now() - interval '30 days'
          )
        )
    )
  order by m.display_name;
$$;

-- ─── Request ────────────────────────────────────────────────────────────────

/**
 * The caller asks p_recipient to be teammates. Returns {result, link_id}:
 *   pending           new request (the app then emails the recipient)
 *   confirmed         they had already asked the caller, so it's mutual now
 *   self / not_roster / already_teammates / already_pending / cooldown
 * Requests for the same pair are serialized, so two people asking each other
 * at the same moment end up confirmed rather than with two rows.
 */
create function public.request_teammate(p_recipient uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  l public.teammate_links%rowtype;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  if p_recipient = me then
    return jsonb_build_object('result', 'self');
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
    insert into public.teammate_links (requester_id, recipient_id)
    values (me, p_recipient)
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
    set status = 'confirmed', responded_at = now()
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
      email_status = null, email_sent_at = null
  where id = l.id;
  return jsonb_build_object('result', 'pending', 'link_id', l.id);
end;
$$;

-- ─── Respond ────────────────────────────────────────────────────────────────

/**
 * The recipient accepts or declines a pending request (profile buttons).
 * Returns {result}: confirmed / declined / not_found (not pending, or not
 * addressed to the caller). Uses up any outstanding email tokens.
 */
create function public.respond_teammate(p_link_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  l public.teammate_links%rowtype;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  select * into l from public.teammate_links
  where id = p_link_id and recipient_id = me and status = 'pending'
  for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  update public.teammate_links
  set status = case when p_accept then 'confirmed' else 'declined' end,
      responded_at = now()
  where id = l.id;
  update public.teammate_tokens tt set used_at = now()
  where tt.link_id = l.id and tt.used_at is null;
  return jsonb_build_object(
    'result', case when p_accept then 'confirmed' else 'declined' end,
    'link_id', l.id,
    'requester_id', l.requester_id
  );
end;
$$;

/**
 * What an email link points at, without using it up. Returns {result}:
 *   ok          pending, addressed to the caller, unused, unexpired
 *   invalid     no such token (or the request was removed)
 *   not_yours   addressed to someone else (no names given)
 *   used        already used, or the request was already answered
 *   expired
 * plus requester_id / requester_name / status when it's the caller's.
 */
create function public.teammate_token_status(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  tk public.teammate_tokens%rowtype;
  l public.teammate_links%rowtype;
  who text;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  select * into tk from public.teammate_tokens where token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('result', 'invalid');
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
    'requester_name', who
  );
end;
$$;

/** Accept/decline from an email link: checks the token, then respond_teammate(). */
create function public.respond_teammate_token(p_token_hash text, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tk public.teammate_tokens%rowtype;
  info jsonb;
begin
  -- Lock the token so a double click can't use it twice.
  select * into tk from public.teammate_tokens
  where token_hash = p_token_hash
  for update;
  info := public.teammate_token_status(p_token_hash);
  if info->>'result' <> 'ok' then
    return info;
  end if;
  return public.respond_teammate(tk.link_id, p_accept)
    || jsonb_build_object('requester_name', info->>'requester_name');
end;
$$;

-- ─── Remove ─────────────────────────────────────────────────────────────────

/** Either teammate ends a confirmed link; it disappears from both profiles. */
create function public.remove_teammate(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_member_id();
  l public.teammate_links%rowtype;
begin
  if me is null or not public.is_member() then
    raise exception 'members only' using errcode = 'insufficient_privilege';
  end if;
  delete from public.teammate_links
  where id = p_link_id and status = 'confirmed' and me in (requester_id, recipient_id)
  returning * into l;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  return jsonb_build_object(
    'result', 'removed',
    'other_id', case when l.requester_id = me then l.recipient_id else l.requester_id end
  );
end;
$$;

revoke all on function
  public.teammate_candidates(),
  public.request_teammate(uuid),
  public.respond_teammate(uuid, boolean),
  public.teammate_token_status(text),
  public.respond_teammate_token(text, boolean),
  public.remove_teammate(uuid)
from public, anon;
grant execute on function
  public.teammate_candidates(),
  public.request_teammate(uuid),
  public.respond_teammate(uuid, boolean),
  public.teammate_token_status(text),
  public.respond_teammate_token(text, boolean),
  public.remove_teammate(uuid)
to authenticated;

-- ─── Leaving the roster ─────────────────────────────────────────────────────
-- A member who is deactivated or loses their email (can't log in) drops all
-- their teammate links, pending or confirmed. Deleting a member cascades.

create function public.teammates_drop_off_roster() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.active or new.email is null then
    delete from public.teammate_links
    where requester_id = new.id or recipient_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.teammates_drop_off_roster() from public, anon, authenticated;

create trigger members_teammates_drop_off_roster
  after update of active, email on public.members
  for each row
  when (old.active is distinct from new.active or old.email is distinct from new.email)
  execute function public.teammates_drop_off_roster();
