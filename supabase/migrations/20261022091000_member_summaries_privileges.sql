-- Supabase's default privileges give `authenticated` full table access, so
-- the column grant in 20261022090000 didn't actually narrow anything: an
-- admin could rewrite the generated summary via the API. Revoke table-wide
-- writes and allow only the override columns (RLS still requires admin).
revoke insert, update, delete, truncate on public.member_summaries from authenticated;
grant update (override_summary, override_by) on public.member_summaries to authenticated;
