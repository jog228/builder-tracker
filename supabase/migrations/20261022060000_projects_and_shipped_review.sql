-- Phase 2 follow-ups: project aliases, and human review of "shipped".

-- ─── shipped → shipped_candidate ────────────────────────────────────────────
-- The classifier only flags candidates. A candidate counts as progress until an
-- exec member approves it in shipped_approvals.

alter table public.message_scores drop constraint message_scores_category_check;
update public.message_scores set category = 'shipped_candidate' where category = 'shipped';
alter table public.message_scores add constraint message_scores_category_check
  check (category in ('progress_update', 'shipped_candidate', 'help_given',
                      'event_related', 'chatter'));

-- ─── Project aliases ────────────────────────────────────────────────────────
-- Admins merge a member's project names ("site", "vetted professional network"
-- → "Vetted Network"). Matching ignores case and punctuation, like
-- projectKey() in lib/scoring/projects.ts. UI: Phase 5 admin pages.

create table public.project_aliases (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  alias       text not null check (length(trim(alias)) > 0),
  canonical   text not null check (length(trim(canonical)) > 0),
  created_by  uuid references public.members (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index project_aliases_member_alias_key
  on public.project_aliases (member_id, (lower(regexp_replace(alias, '[^a-zA-Z0-9]', '', 'g'))));

-- ─── Shipped review queue ───────────────────────────────────────────────────
-- One row per message under review. Scoring inserts classifier candidates as
-- 'pending'; admins can also flag a message manually. An exec member decides
-- 'shipped' or 'progress'. UI: Phase 4 admin area.

create table public.shipped_approvals (
  message_id  text primary key references public.messages (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'shipped', 'progress')),
  source      text not null default 'classifier' check (source in ('classifier', 'manual')),
  priority    integer not null default 0,     -- higher = earlier in the queue
  queued_at   timestamptz not null default now(),
  decided_by  uuid references public.members (id) on delete set null,
  decided_at  timestamptz,
  note        text,
  constraint decided_iff_not_pending check ((status = 'pending') = (decided_at is null))
);
create index shipped_approvals_queue_idx
  on public.shipped_approvals (priority desc, queued_at) where status = 'pending';

-- Exec members' messages are never scored, so they can't be queued either.
create trigger shipped_approvals_reject_excluded
  before insert on public.shipped_approvals
  for each row execute function public.reject_excluded_message_score();

create view public.shipped_review_queue
with (security_invoker = on) as
  select
    a.message_id, a.priority, a.queued_at, a.source,
    m.created_at, m.text, m.channel_name, m.has_attachment,
    mem.id as member_id, mem.display_name,
    s.category, s.substance, s.summary, s.project
  from public.shipped_approvals a
  join public.messages m on m.id = a.message_id
  join public.members mem on mem.id = m.member_id
  left join public.message_scores s on s.message_id = a.message_id
  where a.status = 'pending'
  order by a.priority desc, m.created_at;

-- Excluding someone also drops their pending reviews (decided ones stay as history).
create or replace function public.clear_excluded_member_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.score_snapshots where member_id = new.id;
  delete from public.member_badges where member_id = new.id;
  delete from public.message_scores s
    using public.messages msg
    where msg.id = s.message_id and msg.member_id = new.id;
  delete from public.shipped_approvals a
    using public.messages msg
    where msg.id = a.message_id and msg.member_id = new.id and a.status = 'pending';
  return new;
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.project_aliases enable row level security;
alter table public.shipped_approvals enable row level security;
revoke all on public.project_aliases, public.shipped_approvals, public.shipped_review_queue from anon;
grant select on public.project_aliases, public.shipped_approvals, public.shipped_review_queue to authenticated;
grant all on public.project_aliases, public.shipped_approvals to service_role;
grant select on public.shipped_review_queue to service_role;

create policy "members read" on public.project_aliases
  for select to authenticated using ((select public.is_member()));
create policy "members read" on public.shipped_approvals
  for select to authenticated using ((select public.is_member()));

grant insert, update, delete on public.project_aliases to authenticated;
create policy "admins write" on public.project_aliases
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and created_by = (select public.current_member_id()));

-- Admins (the exec board) flag messages and decide; decisions are signed.
grant insert on public.shipped_approvals to authenticated;
grant update (status, decided_by, decided_at, note) on public.shipped_approvals to authenticated;
create policy "admins flag" on public.shipped_approvals
  for insert to authenticated
  with check ((select public.is_admin()) and status = 'pending' and source = 'manual');
create policy "admins decide" on public.shipped_approvals
  for update to authenticated
  using ((select public.is_admin()))
  with check (status = 'pending' or decided_by = (select public.current_member_id()));
