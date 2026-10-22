-- Rate limiting for the guest (portfolio) password: one row per attempt,
-- keyed by a salted hash of the IP (no raw IPs stored). Service role only:
-- RLS on with no policies, and no grants to anon/authenticated.
create table public.guest_login_attempts (
  id          bigint generated always as identity primary key,
  key_hash    text not null,
  ok          boolean not null,
  at          timestamptz not null default now()
);
create index guest_login_attempts_key_at on public.guest_login_attempts (key_hash, at);
create index guest_login_attempts_at on public.guest_login_attempts (at);

alter table public.guest_login_attempts enable row level security;
revoke all on public.guest_login_attempts from anon, authenticated;
grant all on public.guest_login_attempts to service_role;
