-- Community points no longer have a monthly cap: admins can award +5 / +10
-- any number of times. The amounts check (5 or 10), admin-only RLS and the
-- exec trigger stay.
drop trigger bonus_points_community_cap on public.bonus_points;
drop function public.enforce_community_cap();
