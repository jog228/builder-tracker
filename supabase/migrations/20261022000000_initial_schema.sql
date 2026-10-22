-- Initial schema for the Builder Society tracker. See PLAN.md §4.
-- Writes from cron jobs/scripts use the secret key (service_role), which bypasses RLS.

-- ─── Core identity ──────────────────────────────────────────────────────────

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  avatar_url    text,
  email         text unique,
  -- Linked on first login (Phase 4); used by RLS helpers below.
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  role          text not null default 'member' check (role in ('member', 'admin')),
  cohort        text,
  joined_at     timestamptz not null default now(),
  active        boolean not null default true
);

create table public.member_identities (
  member_id        uuid primary key references public.members (id) on delete cascade,
  groupme_user_id  text unique,
  github_username  text unique
);

-- ─── GroupMe ────────────────────────────────────────────────────────────────

create table public.messages (
  id                text primary key,           -- GroupMe message id
  member_id         uuid references public.members (id) on delete set null,
  sender_groupme_id text not null,              -- kept so senders can be re-mapped later
  sender_type       text not null,              -- 'user' | 'bot' | 'system'
  text              text,
  created_at        timestamptz not null,
  like_count        integer not null default 0,
  liked_by          text[] not null default '{}', -- GroupMe user ids (likers may not be members)
  has_attachment    boolean not null default false,
  raw               jsonb                        -- debugging only; purge with `npm run groupme:purge-raw`
);
create index messages_member_created_idx on public.messages (member_id, created_at);
create index messages_created_idx on public.messages (created_at);

create table public.message_scores (
  message_id  text primary key references public.messages (id) on delete cascade,
  category    text not null check (category in
                ('progress_update', 'shipped', 'help_given', 'event_related', 'chatter')),
  substance   smallint not null check (substance between 0 and 3),
  summary     text,
  model       text not null,
  scored_at   timestamptz not null default now()
);

-- ─── Attendance ─────────────────────────────────────────────────────────────

create table public.events (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  date    date not null,
  type    text not null check (type in ('meeting', 'workshop', 'hackathon', 'social')),
  weight  numeric not null default 1 check (weight >= 0)
);

create table public.attendance (
  event_id     uuid not null references public.events (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  recorded_by  uuid references public.members (id) on delete set null,
  recorded_at  timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- ─── Other activity sources ─────────────────────────────────────────────────

create table public.github_activity (
  member_id   uuid not null references public.members (id) on delete cascade,
  date        date not null,
  commits     integer not null default 0,
  prs_opened  integer not null default 0,
  prs_merged  integer not null default 0,
  repos       text[] not null default '{}',
  primary key (member_id, date)
);

create table public.token_usage (            -- Phase 7, optional
  member_id  uuid not null references public.members (id) on delete cascade,
  date       date not null,
  tokens     bigint not null default 0,
  primary key (member_id, date)
);

-- ─── Scores, badges, awards ─────────────────────────────────────────────────

create table public.score_snapshots (
  member_id    uuid not null references public.members (id) on delete cascade,
  period       text not null check (period = 'all' or period ~ '^\d{4}-\d{2}$'),
  components   jsonb not null default '{}',
  total        numeric not null default 0,
  rank         integer,
  computed_at  timestamptz not null default now(),
  primary key (member_id, period)
);

create table public.badges (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  icon         text
);

create table public.member_badges (
  member_id  uuid not null references public.members (id) on delete cascade,
  badge_id   uuid not null references public.badges (id) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (member_id, badge_id)
);

create table public.awards (
  id         uuid primary key default gen_random_uuid(),
  period     text not null check (period ~ '^\d{4}-\d{2}$'),
  member_id  uuid not null references public.members (id) on delete cascade,
  title      text not null default 'Builder of the Month',
  note       text,
  unique (period, title)
);

-- ─── Sync bookkeeping ───────────────────────────────────────────────────────

create table public.sync_runs (
  id           bigint generated always as identity primary key,
  source       text not null,               -- 'groupme', 'github', ...
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'success', 'error')),
  cursor       text,                        -- e.g. newest GroupMe message id synced
  error        text
);
create index sync_runs_source_started_idx on public.sync_runs (source, started_at desc);

-- ─── Row-level security ─────────────────────────────────────────────────────
-- Logged-in members can read everything. Admins can write attendance, events,
-- member_identities and awards. Everything else is written only by service_role.

create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid()) and active
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid()) and active and role = 'admin'
  );
$$;

revoke all on function public.is_member(), public.is_admin() from public, anon;
grant execute on function public.is_member(), public.is_admin() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'member_identities', 'messages', 'message_scores', 'events',
    'attendance', 'github_activity', 'token_usage', 'score_snapshots', 'badges',
    'member_badges', 'awards', 'sync_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format(
      'create policy "members read" on public.%I for select to authenticated using ((select public.is_member()))',
      t
    );
  end loop;

  foreach t in array array['attendance', 'events', 'member_identities', 'awards'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "admins write" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t
    );
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;
