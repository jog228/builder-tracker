-- Meeting skips: a week's usual meeting day marked "no meeting", so the
-- check-in picker stops offering it and opening check-in doesn't create it.
-- Admins add and remove skips (as themselves). A meeting scheduled on a
-- skipped date with "+ New meeting" removes the skip first; the trigger
-- below only stops one appearing there by accident.

create table public.meeting_skips (
  date        date primary key,
  reason      text,
  created_by  uuid references public.members (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.meeting_skips enable row level security;

revoke all on public.meeting_skips from anon, authenticated;
grant select, insert, delete on public.meeting_skips to authenticated;
grant all on public.meeting_skips to service_role;

create policy "admins read" on public.meeting_skips
  for select to authenticated
  using ((select public.is_admin()));

create policy "admins skip" on public.meeting_skips
  for insert to authenticated
  with check (
    (select public.is_admin())
    and created_by = (select public.current_member_id())
  );

create policy "admins unskip" on public.meeting_skips
  for delete to authenticated
  using ((select public.is_admin()));

-- No meeting on a skipped date.
create function public.reject_meeting_on_skip() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type = 'meeting'
     and exists (select 1 from public.meeting_skips where date = new.date) then
    raise exception 'no meeting on % (skipped)', new.date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger events_reject_skipped_meeting
  before insert or update of date, type on public.events
  for each row execute function public.reject_meeting_on_skip();
