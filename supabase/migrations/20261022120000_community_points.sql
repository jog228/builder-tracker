-- Community help points: admins award +5 or +10 from a profile, with a
-- reason everyone can see, capped at 20 per member per month (club time).
-- Same table and RLS as other bonuses: only admins award (as themselves) and
-- revoke (recording who); exec board members can't receive them (existing
-- bonus_points_reject_excluded trigger). Keep in sync with BONUS.community.

alter table public.bonus_points drop constraint bonus_points_type_check;
alter table public.bonus_points add constraint bonus_points_type_check
  check (type in ('demo', 'other', 'community'));
alter table public.bonus_points add constraint community_amounts
  check (type <> 'community' or points in (5, 10));

-- The monthly cap, checked on insert (and on un-revoking, which RLS doesn't
-- allow anyway). Locks the member's row so two admins can't race past it.
create function public.enforce_community_cap() returns trigger
language plpgsql set search_path = '' as $$
declare
  month_start timestamptz;
  used integer;
begin
  if new.type <> 'community' or new.revoked_at is not null then
    return new;
  end if;
  perform 1 from public.members where id = new.member_id for update;
  month_start := date_trunc('month', new.awarded_at at time zone 'America/New_York')
                 at time zone 'America/New_York';
  select coalesce(sum(points), 0) into used
  from public.bonus_points
  where member_id = new.member_id
    and type = 'community'
    and revoked_at is null
    and id is distinct from new.id
    and awarded_at >= month_start
    and awarded_at < month_start + interval '1 month';
  if used + new.points > 20 then
    raise exception 'community points cap: % already this month, +% would pass 20', used, new.points
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger bonus_points_community_cap
  before insert or update of revoked_at on public.bonus_points
  for each row execute function public.enforce_community_cap();
