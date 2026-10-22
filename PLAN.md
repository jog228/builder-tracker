# Builder Society — Private Builder Tracker: Build Plan

> Drop this file in the root of a new repo and tell Claude Code:
> **"Read PLAN.md. We're starting Phase 0. Do only that phase, then stop so I can review."**
> Do one phase per session. Commit after each phase.

---

## 1. Goal

An internal, members-only web app that ranks Builder Society members by how much they build, **with zero effort from members**. It runs entirely in the background, pulling data from:

1. **GroupMe**: progress updates, shipped projects, peer likes
2. **Attendance**: an organizer taps names on a check-in page at each event (members do nothing)
3. **GitHub**: commits and PRs, using usernames an organizer links once
4. **Claude Enterprise usage** (later, if per-user data is exportable)

The app shows a fun, competitive leaderboard, stats, streaks, badges, and a Builder of the Month award. It's built so it can later become the private section of the public Builder Society site.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | Becomes the future public site too |
| UI | Tailwind CSS + shadcn/ui + Framer Motion + Recharts | Fast, polished, animated |
| DB + Auth | Supabase (Postgres + Auth) | Free tier, row-level security, magic-link login |
| Background jobs | Vercel Cron → Next.js API routes | Nightly syncs, no separate server |
| AI scoring | Anthropic API (`claude-haiku-5-5`) | Cheap message classification |
| Hosting | Vercel | Free tier, pairs with Next.js |

## 3. Things you set up before Phase 1

Put all of these in `.env.local` and **never commit them** (`.env.local` stays in `.gitignore`):

- [ ] `GROUPME_TOKEN`: from https://dev.groupme.com (log in → Access Token)
- [ ] `GROUPME_GROUP_ID`: Claude Code can write a script that lists your groups and their IDs
- [ ] Supabase project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `GITHUB_TOKEN`: a fine-grained, read-only personal access token (Phase 5)
- [ ] `CRON_SECRET`: any long random string; it protects the sync endpoints
- [ ] Your existing manual attendance records, exported as a CSV (name, event, date)

## 4. Data model (Supabase)

```
members            id, display_name, avatar_url, email, role ('member'|'admin'),
                   cohort, joined_at, active (bool)
member_identities  member_id, groupme_user_id, github_username
messages           id (GroupMe msg id), member_id, text, created_at,
                   like_count, liked_by (uuid[]), has_attachment, raw (jsonb)
message_scores     message_id, category ('progress_update'|'shipped'|'help_given'|
                   'event_related'|'chatter'), substance (0-3), summary, model, scored_at
events             id, name, date, type ('meeting'|'workshop'|'hackathon'|'social'), weight
attendance         event_id, member_id, recorded_by, recorded_at
github_activity    member_id, date, commits, prs_opened, prs_merged, repos (text[])
token_usage        member_id, date, tokens   -- Phase 7, optional
score_snapshots    member_id, period ('2026-10' | 'all'), components (jsonb),
                   total, rank, computed_at
badges             id, slug, name, description, icon
member_badges      member_id, badge_id, earned_at
awards             id, period, member_id, title ('Builder of the Month'), note
sync_runs          id, source, started_at, finished_at, status, cursor, error
```

Row-level security: members can read everything (it's internal); only `role='admin'` can write `attendance`, `events`, `member_identities`, and `awards`. Only the service role (used by cron jobs) can write everything else.

## 5. Scoring v1 (tune later)

Monthly score = sum of these components, each capped so no single source dominates:

| Component | Points | Cap / month |
|---|---|---|
| Progress update (substance ≥ 2) | 10 each | 80 |
| "Shipped" post (demo, launch, deploy) | 25 each | 75 |
| Helping others (`help_given`) | 5 each | 25 |
| Likes received on update/shipped posts | 1 each | 30 |
| Event attended | 15 × event weight | none |
| GitHub: active coding days | 3 per day | 60 |
| GitHub: merged PRs | 5 each | 40 |
| Streak bonus (consecutive weeks with an update) | +5 per week | 30 |

Keep all weights in one config file (`lib/scoring/config.ts`) so organizers can tweak them. Also store a score breakdown with every snapshot so anyone can see *why* they rank where they do.

## 6. Phases

### Phase 0: Scaffold
- Next.js + TS + Tailwind + shadcn/ui; ESLint/Prettier; `.env.example`
- Supabase client helpers (browser + server + service role)
- `CLAUDE.md` with project conventions
- **Done when:** `npm run dev` shows a placeholder page and the repo is committed.

### Phase 1: GroupMe ingestion
- `scripts/list-groups.ts`: prints your groups and their IDs
- `lib/groupme.ts`: client for `GET https://api.groupme.com/v3/groups/:id/messages` (paginated with `before_id`, 100 per page; incremental with `since_id`) and `GET /groups/:id` for the member list
- Backfill script: pulls the full history and upserts `members`, `member_identities`, `messages` (idempotent on message id)
- `POST /api/cron/sync-groupme`: incremental sync that saves its cursor in `sync_runs`
- **Done when:** the full history is in Supabase, and running the sync twice creates no duplicates.

### Phase 2: AI message scoring
- `lib/scoring/classify.ts`: batches unscored messages (around 20 per call) and asks Claude for strict JSON: `{id, category, substance, summary}`
- Skip messages under 15 characters and bot or system messages
- `POST /api/cron/score-messages`
- Add a small eval set: 30 hand-labeled real messages, plus a script that reports accuracy
- **Done when:** all messages are scored, the eval set is at least 80% accurate, and the cost per 1,000 messages is logged.

### Phase 3: Attendance (organizer-only)
- `/admin/events`: create and edit events
- `/admin/checkin/[eventId]`: a mobile-first grid of member avatars with names; tap to mark someone present (optimistic UI), plus search
- `scripts/import-attendance.ts`: imports your historical CSV, fuzzy-matching names to members, and prints any it couldn't match
- **Done when:** an organizer can take attendance for 30 people in under a minute on a phone.

### Phase 4: Scores, the leaderboard UI, and auth
- Supabase magic-link login, limited to emails in `members` (or `@lehigh.edu`)
- `lib/scoring/compute.ts` → `score_snapshots` for the current month and all time; `POST /api/cron/compute-scores`
- Pages:
  - `/leaderboard`: top-3 podium (animated), a full ranked list with rank change ▲▼, a month / all-time toggle, and filters
  - `/builders/[id]`: profile with score breakdown, activity heatmap, streak 🔥, badges, recent updates (with Claude's summaries), and events attended
  - `/stats`: group-wide charts (updates per week, attendance trend, most active days and hours)
- **Done when:** a logged-in member sees real rankings, and a logged-out visitor sees nothing.

### Phase 5: GitHub
- `/admin/members`: link GitHub usernames (and fix any GroupMe ↔ member mismatches)
- `lib/github.ts`: a GraphQL `contributionsCollection(from, to)` query per user for daily commit counts and PRs
- `POST /api/cron/sync-github` (nightly)
- **Done when:** GitHub components show up in scores and on profiles.

### Phase 6: Badges and Builder of the Month
- Badge rules engine (`lib/badges/rules.ts`), run after scores are computed. Starter badges:
  - **Shipper**: 3+ shipped posts
  - **Never Misses**: attended every event this month
  - **On Fire**: 4-week update streak
  - **Night Owl**: 5+ updates posted after midnight
  - **Crowd Favorite**: most likes in a month
  - **Helper**: 5+ `help_given`
- `/admin/awards`: the month's top 5 with breakdowns; an admin picks the winner and writes a note
- `/hall-of-fame`: past winners
- **Done when:** badges appear automatically and an admin can crown a Builder of the Month.

### Phase 7: Claude Enterprise usage (optional)
- First, confirm whether your Enterprise plan exposes per-user usage through an admin or analytics API or export. If it only offers a CSV export, build a CSV upload in `/admin`.
- Keep the weight low (it's a weak signal), or show it on profiles only without counting it toward scores.

### Phase 8: Deploy and harden
- Deploy to Vercel; add `vercel.json` crons: GroupMe every 6 hours; scoring, GitHub, and score computation nightly
- Every cron route checks `Authorization: Bearer ${CRON_SECRET}`
- `/admin/health`: last run, status, and errors for each sync
- **Done when:** it runs untouched for a week and the numbers update on their own.

## 7. Guardrails for Claude Code
- Never commit secrets; read them only from env
- All syncs are idempotent and resumable
- Don't store more GroupMe data than needed; keep `raw` only for debugging, and allow a purge
- Scoring logic is pure functions with unit tests (Vitest)
- No public routes yet. Everything except `/login` requires auth.

## 8. Later: hook into the public site
The public Builder Society site will live in the same Next.js app. Public pages read from a `public_stats` view (aggregates, plus featured builders who said yes) and never from raw tables.

## 9. Open decisions (answer when you get there)
- Login: members' school emails, or a fixed allowlist?
- Can members see the full ranking, or only the top 10 plus their own rank?
- Event weights (e.g., hackathon = 2×)?
- Should anyone be excluded from rankings (e.g., e-board)?
