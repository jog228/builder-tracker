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

## Conventions

- Path alias `@/*` maps to the repo root (`@/lib/...`, `@/components/...`).
- Supabase clients:
  - `lib/supabase/client.ts`: Client Components (anon key, RLS applies)
  - `lib/supabase/server.ts`: Server Components, Actions, Route Handlers (user session, RLS applies)
  - `lib/supabase/admin.ts`: service role, **bypasses RLS**. Only for cron routes and scripts. It is `server-only`.
- UI components: add with `npx shadcn@latest add <name>`; they go into `components/ui/`.
- Scoring weights live only in `lib/scoring/config.ts`. Scoring logic is pure functions with Vitest tests.
- Cron routes live under `app/api/cron/*` and must check `Authorization: Bearer ${CRON_SECRET}`.
- Standalone scripts go in `scripts/` and run with `npx tsx`.

## Guardrails

- Never commit secrets. Read them only from env. `.env.local` is gitignored; keep `.env.example` updated with every new variable name.
- All syncs are idempotent (upsert on source IDs) and resumable (cursor in `sync_runs`).
- Store only the GroupMe data we need. `raw` is for debugging and must be purgeable.
- No public routes yet. Everything except `/login` requires auth (enforced from Phase 4).
