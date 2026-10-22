-- "Now Building" edits move from admins to the profile's owner: only you can
-- write the override on your own row, and only in your own name. Exec board
-- members still can't have a row at all (member_summaries_reject_excluded).

drop policy "admins override" on public.member_summaries;

-- Owners can create their row (e.g. before any summary is generated), but
-- only the override columns; generated columns stay service-role only.
grant insert (member_id, override_summary, override_by) on public.member_summaries to authenticated;

create policy "owners override" on public.member_summaries
  for update to authenticated
  using ((select public.is_member()) and member_id = (select public.current_member_id()))
  with check (
    member_id = (select public.current_member_id())
    and (override_by is null or override_by = (select public.current_member_id()))
  );

create policy "owners create" on public.member_summaries
  for insert to authenticated
  with check (
    (select public.is_member())
    and member_id = (select public.current_member_id())
    and (override_by is null or override_by = (select public.current_member_id()))
  );

-- Stamp who/when on insert too (an owner's first edit can create the row).
create or replace function public.stamp_summary_override() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.override_summary is distinct from old.override_summary then
    new.override_at := case when new.override_summary is null then null else now() end;
    if new.override_summary is null then new.override_by := null; end if;
  end if;
  return new;
end;
$$;

drop trigger member_summaries_stamp_override on public.member_summaries;
create trigger member_summaries_stamp_override
  before insert or update on public.member_summaries
  for each row execute function public.stamp_summary_override();
