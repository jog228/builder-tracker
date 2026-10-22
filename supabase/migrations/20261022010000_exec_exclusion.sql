-- Exec board exclusion. Exec members are admins whose activity is still ingested
-- (complete history) but never scored, ranked, badged, awarded or counted in stats.
-- Likes they give to others still count for the recipients.

alter table public.members
  add column exclude_from_rankings boolean not null default false;

-- Everyone who can appear in rankings, Builder of the Month candidates and
-- group-wide stats. Read through this instead of `members` for anything scored.
create view public.ranked_members
with (security_invoker = on) as
  select * from public.members
  where active and not exclude_from_rankings;

grant select on public.ranked_members to authenticated, service_role;
revoke all on public.ranked_members from anon;

-- ─── Backstop: never write scored/derived rows for an excluded member ───────
-- Application code filters first (lib/scoring/eligibility.ts); these triggers
-- make a missed filter fail loudly instead of leaking into rankings.

create function public.reject_excluded_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.members
    where id = new.member_id and exclude_from_rankings
  ) then
    raise exception 'member % is excluded from rankings (exec board); refusing % on %',
      new.member_id, tg_op, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attendance_reject_excluded
  before insert or update on public.attendance
  for each row execute function public.reject_excluded_member();
create trigger score_snapshots_reject_excluded
  before insert or update on public.score_snapshots
  for each row execute function public.reject_excluded_member();
create trigger member_badges_reject_excluded
  before insert or update on public.member_badges
  for each row execute function public.reject_excluded_member();
create trigger awards_reject_excluded
  before insert or update on public.awards
  for each row execute function public.reject_excluded_member();

-- message_scores has no member_id; check the message's sender.
create function public.reject_excluded_message_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.messages msg
    join public.members m on m.id = msg.member_id
    where msg.id = new.message_id and m.exclude_from_rankings
  ) then
    raise exception 'message % is from an excluded member; refusing to score it',
      new.message_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger message_scores_reject_excluded
  before insert or update on public.message_scores
  for each row execute function public.reject_excluded_message_score();

-- ─── On exclusion: drop derived data that would otherwise keep showing ──────
-- Snapshots, badges and message scores are recomputable, so they're deleted.
-- Attendance and awards are human-entered history, so they're kept (and
-- filtered out at read time via ranked_members).

create function public.clear_excluded_member_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.score_snapshots where member_id = new.id;
  delete from public.member_badges where member_id = new.id;
  delete from public.message_scores s
    using public.messages msg
    where msg.id = s.message_id and msg.member_id = new.id;
  return new;
end;
$$;

revoke all on function public.clear_excluded_member_scores() from public, anon, authenticated;

create trigger members_clear_scores_on_exclude
  after update of exclude_from_rankings on public.members
  for each row
  when (new.exclude_from_rankings and not old.exclude_from_rankings)
  execute function public.clear_excluded_member_scores();
