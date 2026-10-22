-- Phase 3: weekly meeting check-in. See PLAN.md §6 Phase 3.
-- Admins only, at every layer: RLS here, plus requireAdmin()/403 in the app.

-- ─── Weekly meetings ────────────────────────────────────────────────────────
-- One auto-created "Weekly Meeting" per week (date = the configured weekday).

alter table public.events
  add column weekly      boolean not null default false,
  add column created_by  uuid references public.members (id) on delete set null,
  add column created_at  timestamptz not null default now();

create unique index events_one_weekly_meeting on public.events (date) where weekly;

-- ─── Attendance audit: who marked it, and when ──────────────────────────────
-- recorded_at is always the server's clock (a client can't backdate it), and
-- every row must name who marked it. The demo trigger passes awarded_by.

create function public.stamp_attendance() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.recorded_by is null then
    raise exception 'attendance needs recorded_by (who marked it)'
      using errcode = 'not_null_violation';
  end if;
  new.recorded_at := now();
  return new;
end;
$$;

create trigger attendance_stamp
  before insert or update on public.attendance
  for each row execute function public.stamp_attendance();

-- ─── RLS: admins mark attendance as themselves ──────────────────────────────
-- Replaces the generic "admins write" policy from the initial schema. Events
-- keep theirs (admins insert/update/delete, members read).

drop policy "admins write" on public.attendance;

create policy "admins mark" on public.attendance
  for insert to authenticated
  with check (
    (select public.is_admin())
    and recorded_by = (select public.current_member_id())
  );

create policy "admins update" on public.attendance
  for update to authenticated
  using ((select public.is_admin()))
  with check (
    (select public.is_admin())
    and recorded_by = (select public.current_member_id())
  );

create policy "admins unmark" on public.attendance
  for delete to authenticated
  using ((select public.is_admin()));

-- Only admins insert/update/delete events (unchanged), and they must record
-- themselves as the creator.
drop policy "admins write" on public.events;

create policy "admins create" on public.events
  for insert to authenticated
  with check (
    (select public.is_admin())
    and created_by = (select public.current_member_id())
  );

create policy "admins edit" on public.events
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "admins delete" on public.events
  for delete to authenticated
  using ((select public.is_admin()));
