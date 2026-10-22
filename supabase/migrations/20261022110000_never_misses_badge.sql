-- Badges can be earned per period ("2026-10"), e.g. Never Misses each month.
-- 'all' is for once-ever badges. member_badges was empty when this ran.

alter table public.member_badges add column period text not null default 'all'
  check (period = 'all' or period ~ '^\d{4}-\d{2}$');
alter table public.member_badges drop constraint member_badges_pkey;
alter table public.member_badges add primary key (member_id, badge_id, period);

update public.badges
set description = '100% attendance for the month.', icon = 'calendar-check'
where slug = 'never-misses';
