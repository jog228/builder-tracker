# Builder Society Tracker

Members-only leaderboard ranking Builder Society members by how much they build.
Data is pulled in the background from GroupMe, attendance check-ins, and GitHub.
The full build plan, data model, and scoring rules are in `PLAN.md`. Work one phase
at a time, and stop for review after each phase.

## Stack

- Next.js 15 (App Router) + TypeScript, Tailwind v4, shadcn/ui
- Supabase (Postgres + Auth) via `@supabase/ssr`
- Vercel (hosting + cron), Anthropic API (`claude-haiku-5-5`) for message scoring

## Commands

- `npm run dev`: dev server at http://localhost:3000
- `npm run lint` / `npm run typecheck` / `npm run format`
- `npm run build`: production build
- `npm run db:push`: apply `supabase/migrations/*.sql` to the linked project (Supabase CLI)
- `npm test`: Vitest unit tests (`*.test.ts` next to the code)
- `npm run test:db`: integration tests in `tests/db/` against the linked project's real API and RLS (creates and deletes throwaway fixtures)
- `npm run groupme:list-groups` / `groupme:backfill` / `groupme:sync` / `groupme:purge-raw`
- `npm run score-messages` / `npm run eval:classifier`: AI message scoring and its eval (both call the Anthropic API and cost money)
- `npm run refresh-summaries [-- --force]`: regenerate "Now Building" summaries (also runs at the end of `score-messages`; costs money)
- `npm run compute-scores`: recompute leaderboard snapshots
- `npm run roster:import -- [data/roster.csv] [--write]`: match roster emails to members by GroupMe name (dry run unless `--write`). `data/` is gitignored.
- `npm run set-email -- <GroupMe id | name> <email | --clear>`: allow a member to log in
- `npm run login-link -- <email>`: DEV ONLY, prints a one-time login link (no email sent)
- `npm run flag-shipped -- <message id> [--priority N]`: queue a message for shipped review
- `npm run set-exec -- [--dry-run] "<GroupMe name or id>" ...`: mark exec board members (admin + excluded from rankings)

Scripts run via `tsx --conditions=react-server --env-file=.env.local` so they can import `server-only` modules.

## Conventions

- Path alias `@/*` maps to the repo root (`@/lib/...`, `@/components/...`).
- Guests (portfolio spectators): `PORTFOLIO_PASSWORD` on `/login` sets a signed httpOnly cookie (`lib/guest-token.ts`, rate-limited via `guest_login_attempts`). Guests have no Supabase user, no member row and never appear in rankings. They may only view `GUEST_ROUTES` in `lib/access.ts` (leaderboard, profiles, how-it-works); those pages call `requireReader()`, which gives members their own session and guests `guestReadClient()` (secret-key client wrapped to `select` on a fixed table list only). Every server action uses `getViewer()`, which is null for guests, so they get 403.
- Supabase clients:
  - `lib/supabase/client.ts`: Client Components (publishable key, RLS applies)
  - `lib/supabase/server.ts`: Server Components, Actions, Route Handlers (user session, RLS applies)
  - `lib/supabase/admin.ts`: secret key (`sb_secret_`), **bypasses RLS**. Only for cron routes and scripts (plus the guest read-only wrapper and the guest rate-limit log). It is `server-only`.
- UI components: add with `npx shadcn@latest add <name>`; they go into `components/ui/`.
- Scoring weights live only in `lib/scoring/config.ts`. Scoring logic is pure functions with Vitest tests. Per-update rules (points at `UPDATE_MIN_SUBSTANCE`, streak weeks at `STREAK_MIN_SUBSTANCE`) live in `lib/scoring/updates.ts`; scoring and the profile both use them.
- Exec board members (`members.exclude_from_rankings`) are ingested but never scored, ranked, badged, awarded, counted in stats, or given attendance rows. Query `ranked_members` (view) or use `isRankable()` from `lib/scoring/eligibility.ts`. DB triggers reject derived rows for them as a backstop. Likes they _give_ still count for recipients. See PLAN.md §4a.
- Route access is an allowlist, deny by default (`lib/access.ts`): members may reach only `/`, `/leaderboard`, `/stats`, `/how-it-works` and `/builders/[id]`; `/login`, `/not-a-member`, `/auth/*` and `/api/cron/*` are public; everything else is admin-only. Middleware redirects non-admins to `/leaderboard`, and every page also guards itself (`requireViewer()` for member routes, `requireAdmin()` for the rest). A new page is admin-only until it is added to `MEMBER_ROUTES`; `lib/access.test.ts` fails if a page's guard doesn't match. Admin-only server actions return `FORBIDDEN` (403) via `getAdmin()`, never a redirect.
- Cron routes live under `app/api/cron/*` and must check `Authorization: Bearer ${CRON_SECRET}`. Schedules are in `vercel.json` (Hobby plan: once a day each, an hour apart: sync 08:00, score 09:00, compute 10:00 UTC).
- `/how-it-works` renders the scoring rubric straight from `lib/scoring/config.ts`; change numbers there, not on the page.
- Standalone scripts go in `scripts/` and get an npm script entry.
- Schema changes are new files in `supabase/migrations/` (never edit an applied migration). Supabase's default privileges give `authenticated` full access to every new table, so a column-level `grant update (...)` does nothing on its own: first `revoke insert, update, delete ... from authenticated`, then grant the columns. RLS is still the main gate.
- GroupMe: `lib/groupme.ts` is the API client; `lib/groupme-sync.ts` holds the shared backfill/incremental logic. Incremental sync pages with `after_id` (not `since_id`, which skips messages when >100 arrive) and re-reads the last 7 days to refresh likes.
- GroupMe subtopics are separate channels (`messages.channel_id` / `channel_name`), each with its own sync cursor.
- Message scoring: `lib/scoring/classify.ts` is pure (prompt, request, parsing, cost); `lib/scoring/score-messages.ts` loads, runs and saves results through a swappable `ClassifyExecutor` (realtime now, Batch API later). Never send member names to the model.
- Attendance: weekly meetings only (`WEEKLY_MEETING` in `lib/scoring/config.ts`), checked in at `/admin/checkin`, for any meeting since `SEASON_START` (the first one is the "Kickoff"). `applyCheckin()` in `lib/attendance/checkin.ts` is the single write path (admin check → 403, exec → 409), using the admin's session so RLS applies. Admins write attendance/events only as themselves.
- "Now Building" (`member_summaries`): `lib/summaries/now-building.ts` is pure (which updates, when to regenerate, prompt, validation, card fallbacks); `lib/summaries/refresh.ts` runs at the end of the message-scoring job (no cron of its own) and only for members with an unseen scored update. Project comes from scored updates + `project_aliases`, not the model. Names are redacted before sending and outputs naming a member are rejected. Only the profile's owner edits it (`canEditNowBuilding()`; RLS "owners override"/"owners create" on their own row, in their own name): the text goes in `override_summary` (who/when stamped by the database), and "Reset to auto-summary" clears it. Admins can't edit other people's. Exec board members never get a row (trigger).
- Badges: `member_badges` has a `period` ("2026-10", or "all" for once-ever badges). `lib/badges/award.ts` runs at the end of `computeAndSaveScores()`; per-month badges are awarded only for completed months and never revoked (`badgeSync()`). Only Never Misses (`lib/badges/never-misses.ts`, on `lib/attendance/meetings.ts`) is live; the rest show "coming soon" until their rules exist (`LIVE_BADGES` in `lib/data/profile.ts`).
- Community points (`bonus_points.type = community`): +5/+10 only, no monthly cap, admin-only from a profile (`checkCommunityAward()` in `lib/scoring/community.ts`; a DB check mirrors the amounts). Reasons are stored as text, so old ones keep displaying after a quick pick is removed. `tests/db/fixtures.ts` makes signed-in throwaway members for DB tests.
- Bonus points (`bonus_points`): manual, uncapped, demo default in `lib/scoring/config.ts`. A demo counts once per member per event and also marks attendance (DB trigger). Undo = revoke (`revoked_at`), never delete. Counting rules live in `lib/scoring/bonus.ts`.
- Shipped is never awarded by the model: it outputs `shipped_candidate`, queued in `shipped_approvals`; only an exec "yes" makes it shipped (`effectiveCategory()`). Project names go through `project_aliases` (`lib/scoring/projects.ts`). Classifier batches run chronologically so `author_projects` carries forward.
- Auth: Google sign-in (Supabase OAuth) for `@lehigh.edu` Workspace accounts (`hd` claim checked server-side), allowlisted by `members.email`. The login page no longer offers an email link; `/auth/confirm` stays for `npm run login-link` in local dev (admins-only outside dev). Rules are pure in `lib/auth-rules.ts`; `completeLogin()` links the auth user to the member by email after `/auth/callback` or `/auth/confirm`, and `getViewer()` re-checks them on every request. Lehigh accounts not on the roster go to `/not-a-member`. `getViewer()` / `requireViewer()` / `requireAdmin()` in `lib/auth.ts`. Pages under `app/(app)/` are members-only via the layout + middleware. Read data with the user's session (RLS); use the secret-key client only in cron, scripts, and score recomputation.
- UI: light "Daylight Site Report" theme only (concrete `#E6E2D8`, navy ink `#1B2A41`, safety yellow `#F2B705`; tokens like `bg-ink` / `text-rust` in `app/globals.css`). Headlines `font-display` (Saira Stencil One), body Barlow Condensed. Square corners, 2-3px ink borders. Reference mockups live in `docs/design/` (not linted or formatted). Shared bits in `components/bs/` (`CountUp`, `FloorsBar`, `Stamp`, `CautionTape`); animation with `motion/react` (respect `useReducedMotion`); charts with Recharts.
- `messages.liked_by` stores GroupMe user ids (likers may not be members); `messages.sender_groupme_id` allows re-mapping senders to members.

## Guardrails

- Never commit secrets. Read them only from env. `.env.local` is gitignored; keep `.env.example` updated with every new variable name.
- All syncs are idempotent (upsert on source IDs) and resumable (cursor in `sync_runs`).
- Store only the GroupMe data we need. `raw` is for debugging and must be purgeable.
- No public routes yet. Everything except `/login` requires auth (enforced from Phase 4).
