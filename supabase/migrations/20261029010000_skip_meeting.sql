-- "No meeting this week" on the check-in page: skip_meeting() marks a date
-- skipped and removes its meeting (if any) in one transaction. Runs as the
-- caller, so RLS applies (admins only, skip recorded in their own name).
-- Sign-ins on that meeting go with it (on delete cascade), but only when the
-- caller confirmed them. A meeting with demos is never skipped: deleting the
-- event would delete the demo rows, and bonus points are revoked, not deleted.

create function public.skip_meeting(
  p_date date,
  p_reason text,
  p_remove_sign_ins boolean
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  meeting_id uuid;
  sign_ins integer := 0;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;

  select id into meeting_id from public.events
  where type = 'meeting' and date = p_date;

  if meeting_id is not null then
    if exists (select 1 from public.bonus_points where event_id = meeting_id) then
      raise exception 'that meeting has demos, so it can''t be skipped'
        using errcode = 'check_violation';
    end if;
    select count(*) into sign_ins from public.attendance where event_id = meeting_id;
    if sign_ins > 0 and not p_remove_sign_ins then
      raise exception 'that meeting has % sign-ins', sign_ins
        using errcode = 'check_violation';
    end if;
  end if;

  -- Skip first, so nothing can recreate the meeting in between.
  insert into public.meeting_skips (date, reason, created_by)
  values (p_date, nullif(btrim(p_reason), ''), public.current_member_id());

  if meeting_id is not null then
    delete from public.events where id = meeting_id;
  end if;
  return sign_ins;
end;
$$;

revoke all on function public.skip_meeting(date, text, boolean) from public, anon;
grant execute on function public.skip_meeting(date, text, boolean) to authenticated;
