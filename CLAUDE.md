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
- `npm run groupme:list-groups` / `groupme:backfill` / `groupme:sync` / `groupme:purge-raw`
- `npm run score-messages` / `npm run eval:classifier`: AI message scoring and its eval (both call the Anthropic API and cost money)
- `npm run flag-shipped -- <message id> [--priority N]`: queue a message for shipped review
- `npm run set-exec -- [--dry-run] "<GroupMe name or id>" ...`: mark exec board members (admin + excluded from rankings)

Scripts run via `tsx --conditions=react-server --env-file=.env.local` so they can import `server-only` modules.

## Conventions

- Path alias `@/*` maps to the repo root (`@/lib/...`, `@/components/...`).
- Supabase clients:
  - `lib/supabase/client.ts`: Client Components (publishable key, RLS applies)
  - `lib/supabase/server.ts`: Server Components, Actions, Route Handlers (user session, RLS applies)
  - `lib/supabase/admin.ts`: secret key (`sb_secret_`), **bypasses RLS**. Only for cron routes and scripts. It is `server-only`.
- UI components: add with `npx shadcn@latest add <name>`; they go into `components/ui/`.
- Scoring weights live only in `lib/scoring/config.ts`. Scoring logic is pure functions with Vitest tests.
- Exec board members (`members.exclude_from_rankings`) are ingested but never scored, ranked, badged, awarded, counted in stats, or given attendance rows. Query `ranked_members` (view) or use `isRankable()` from `lib/scoring/eligibility.ts`. DB triggers reject derived rows for them as a backstop. Likes they _give_ still count for recipients. See PLAN.md §4a.
- Cron routes live under `app/api/cron/*` and must check `Authorization: Bearer ${CRON_SECRET}`.
- Standalone scripts go in `scripts/` and get an npm script entry.
- Schema changes are new files in `supabase/migrations/` (never edit an applied migration).
- GroupMe: `lib/groupme.ts` is the API client; `lib/groupme-sync.ts` holds the shared backfill/incremental logic. Incremental sync pages with `after_id` (not `since_id`, which skips messages when >100 arrive) and re-reads the last 7 days to refresh likes.
- GroupMe subtopics are separate channels (`messages.channel_id` / `channel_name`), each with its own sync cursor.
- Message scoring: `lib/scoring/classify.ts` is pure (prompt, request, parsing, cost); `lib/scoring/score-messages.ts` loads, runs and saves results through a swappable `ClassifyExecutor` (realtime now, Batch API later). Never send member names to the model.
- Bonus points (`bonus_points`): manual, uncapped, demo default in `lib/scoring/config.ts`. A demo counts once per member per event and also marks attendance (DB trigger). Undo = revoke (`revoked_at`), never delete. Counting rules live in `lib/scoring/bonus.ts`.
- Shipped is never awarded by the model: it outputs `shipped_candidate`, queued in `shipped_approvals`; only an exec "yes" makes it shipped (`effectiveCategory()`). Project names go through `project_aliases` (`lib/scoring/projects.ts`). Classifier batches run chronologically so `author_projects` carries forward.
- `messages.liked_by` stores GroupMe user ids (likers may not be members); `messages.sender_groupme_id` allows re-mapping senders to members.

## Guardrails

- Never commit secrets. Read them only from env. `.env.local` is gitignored; keep `.env.example` updated with every new variable name.
- All syncs are idempotent (upsert on source IDs) and resumable (cursor in `sync_runs`).
- Store only the GroupMe data we need. `raw` is for debugging and must be purgeable.
- No public routes yet. Everything except `/login` requires auth (enforced from Phase 4).
