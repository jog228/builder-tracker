-- Manual bonus points (demos, helping run a workshop, ...). Uncapped. See PLAN.md §5.
-- Undo is a soft revoke (revoked_at/revoked_by), so the award log stays complete.

create table public.bonus_points (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  event_id    uuid references public.events (id) on delete cascade,
  type        text not null check (type in ('demo', 'other')),
  points      integer not null check (points > 0),
  reason      text not null check (length(trim(reason)) > 0),
  awarded_by  uuid references public.members (id) on delete set null,
  awarded_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references public.members (id) on delete set null,
  constraint demo_needs_event check (type <> 'demo' or event_id is not null),
  constraint revoked_by_needs_revoked_at check (revoked_by is null or revoked_at is not null)
);

-- A demo counts once per member per event (revoked demos don't block a re-award).
create unique index bonus_points_one_demo_per_event
  on public.bonus_points (member_id, event_id)
  where type = 'demo' and revoked_at is null;
create index bonus_points_member_idx on public.bonus_points (member_id, awarded_at);

-- Exec board members can't receive bonus points. Revoking an existing award is
-- still allowed (e.g. someone joined the exec board after earning it).
create trigger bonus_points_reject_excluded
  before insert or update on public.bonus_points
  for each row when (new.revoked_at is null)
  execute function public.reject_excluded_member();

-- Demoing at an event means you were there: record attendance too.
-- Revoking the demo leaves attendance alone.
create function public.demo_marks_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.attendance (event_id, member_id, recorded_by)
  values (new.event_id, new.member_id, new.awarded_by)
  on conflict (event_id, member_id) do nothing;
  return new;
end;
$$;

revoke all on function public.demo_marks_attendance() from public, anon, authenticated;

create trigger bonus_points_demo_attendance
  after insert on public.bonus_points
  for each row when (new.type = 'demo' and new.revoked_at is null)
  execute function public.demo_marks_attendance();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Members read. Admins award (as themselves) and revoke; nobody deletes, so the
-- log can't be rewritten from the app.

create function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = (select auth.uid());
$$;

revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated;

alter table public.bonus_points enable row level security;
revoke all on public.bonus_points from anon;
grant select, insert on public.bonus_points to authenticated;
grant update (revoked_at, revoked_by) on public.bonus_points to authenticated;
grant all on public.bonus_points to service_role;

create policy "members read" on public.bonus_points
  for select to authenticated using ((select public.is_member()));

create policy "admins award" on public.bonus_points
  for insert to authenticated
  with check (
    (select public.is_admin())
    and awarded_by = (select public.current_member_id())
    and revoked_at is null
  );

create policy "admins revoke" on public.bonus_points
  for update to authenticated
  using ((select public.is_admin()) and revoked_at is null)
  with check (revoked_by = (select public.current_member_id()));

-- ─── Badge ──────────────────────────────────────────────────────────────────

insert into public.badges (slug, name, description, icon)
values ('demo-day', 'Demo Day', 'Demoed at 3 or more events', '🎤')
on conflict (slug) do nothing;
