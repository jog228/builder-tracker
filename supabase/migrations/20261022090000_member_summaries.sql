-- "Now Building" profile card: one generated summary per member, plus an
-- optional admin override. Generated columns are written only by the
-- service role (the message-scoring job); admins may only edit the override.

create table public.member_summaries (
  member_id           uuid primary key references public.members (id) on delete cascade,
  project             text,
  summary             text,
  source_message_ids  text[] not null default '{}',
  update_count        integer not null default 0,
  last_post_at        timestamptz,
  model               text,
  generated_at        timestamptz,
  -- Admin edit. When set it's shown instead of `summary`, until cleared.
  override_summary    text check (override_summary is null or length(trim(override_summary)) between 1 and 400),
  override_by         uuid references public.members (id) on delete set null,
  override_at         timestamptz
);

-- Exec board members never get a summary (PLAN.md §4a).
create trigger member_summaries_reject_excluded
  before insert or update on public.member_summaries
  for each row execute function public.reject_excluded_member();

-- An override records who and when; the time is the server's.
create function public.stamp_summary_override() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.override_summary is distinct from old.override_summary then
    new.override_at := case when new.override_summary is null then null else now() end;
    if new.override_summary is null then new.override_by := null; end if;
  end if;
  return new;
end;
$$;

create trigger member_summaries_stamp_override
  before update on public.member_summaries
  for each row execute function public.stamp_summary_override();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.member_summaries enable row level security;
revoke all on public.member_summaries from anon;
grant select on public.member_summaries to authenticated;
grant update (override_summary, override_by) on public.member_summaries to authenticated;
grant all on public.member_summaries to service_role;

create policy "members read" on public.member_summaries
  for select to authenticated using ((select public.is_member()));

create policy "admins override" on public.member_summaries
  for update to authenticated
  using ((select public.is_admin()))
  with check (
    (select public.is_admin())
    and (override_by is null or override_by = (select public.current_member_id()))
  );
