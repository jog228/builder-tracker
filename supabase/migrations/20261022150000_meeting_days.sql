-- Meeting days: admins can schedule a meeting on any date from the check-in
-- page. One meeting per date (any meeting, not only auto-created weekly
-- ones), an optional start time per meeting, and no sign-ins before the
-- meeting's date. Checked before this ran: no two meetings shared a date.

alter table public.events add column start_time time;
comment on column public.events.start_time is
  'Meeting start (club time). Null = WEEKLY_MEETING.time in lib/scoring/config.ts.';

-- Replaces the weekly-only index: one meeting per date, whatever created it.
create unique index events_one_meeting_per_date on public.events (date)
  where type = 'meeting';
drop index public.events_one_weekly_meeting;

-- Nobody is signed in to a meeting before its date (club time, America/New_York).
-- Covers demos too: a demo inserts its attendance row through this table.
create function public.reject_future_attendance() returns trigger
language plpgsql set search_path = '' as $$
declare
  meeting_date date;
begin
  select date into meeting_date from public.events where id = new.event_id;
  if meeting_date > (now() at time zone 'America/New_York')::date then
    raise exception 'that meeting is on %, sign-ins open that day', meeting_date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attendance_reject_future
  before insert on public.attendance
  for each row execute function public.reject_future_attendance();
