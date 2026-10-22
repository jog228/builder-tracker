-- Phase 4: score snapshots with rank movement, and the badge catalog.

-- Rank movement (▲▼): the rank as of the last computation on an earlier day.
alter table public.score_snapshots
  add column prev_rank integer,
  add column prev_rank_on date;

-- Starter badges (awarded by the Phase 6 rules engine). Seeded now so profiles
-- can show the full shelf, earned or locked.
insert into public.badges (slug, name, description, icon) values
  ('shipper',        'Shipper',         '3+ approved shipped posts',            '🚀'),
  ('never-misses',   'Never Misses',    'Attended every event this month',      '📅'),
  ('on-fire',        'On Fire',         '4-week update streak',                 '🔥'),
  ('night-owl',      'Night Owl',       '5+ updates posted after midnight',     '🦉'),
  ('crowd-favorite', 'Crowd Favorite',  'Most likes in a month',                '❤️'),
  ('helper',         'Helper',          '5+ times helping other builders',      '🤝')
on conflict (slug) do nothing;
