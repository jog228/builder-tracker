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
                   cohort, joined_at, active (bool), auth_user_id,
                   exclude_from_rankings (bool, default false)  -- exec board, see §4a
ranked_members     view: members where active and not exclude_from_rankings
member_identities  member_id, groupme_user_id, github_username
messages           id (GroupMe msg id), channel_id, channel_name, reply_to_id,
                   member_id, sender_groupme_id, sender_type,
                   text, created_at, like_count, liked_by (text[] of GroupMe user ids),
                   has_attachment, raw (jsonb)
message_scores     message_id, category ('progress_update'|'shipped'|'help_given'|
                   'event_related'|'chatter'), substance (0-3), summary, project, model, scored_at
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

## 4a. Exec board exclusion

Exec board members get `role='admin'` and `exclude_from_rankings=true`. Mark them with `npm run set-exec -- "<GroupMe name or user id>" ...` (later, a toggle on `/admin/members`).

- **Still ingested:** their GroupMe messages sync like everyone else's, so the history stays complete.
- **Never scored:** AI scoring skips their messages (no API cost).
- **Never counted:** they never count toward any score, streak, badge, stat or award. They're left out of the leaderboard, Builder of the Month candidates, group-wide stats and `score_snapshots`.
- **Attendance:** no attendance rows are created for them, and they're hidden from the check-in grid by default.
- **Likes they give still count:** a like from an exec on another member's update counts for that member.
- **One rule in code:** anything scored reads from the `ranked_members` view or calls `isRankable()` (`lib/scoring/eligibility.ts`).
- **Database backstop:** triggers reject `attendance`, `score_snapshots`, `member_badges`, `awards` and `message_scores` rows for excluded members.
- **When someone is excluded:** their snapshots, badges and message scores are deleted. Past attendance and awards are kept as history but filtered out at read time.
- **Tested:** a unit test (`lib/scoring/rank.test.ts`) proves an excluded member never appears in rankings.

## 5. Scoring v1 (tune later)

Monthly score = sum of these components, each capped so no single source dominates:

| Component | Points | Cap / month |
|---|---|---|
| Progress update (substance ≥ 2) | 10 each | 80 |
| "Shipped" post (needs evidence: live link, demo, or explicit "it's live"); once per member per project (`countableShipped()`) | 25 each | 75 |
| Helping others (`help_given`) | 5 each | 25 |
| Likes received on update/shipped posts | 1 each | 30 |
| Event attended | 15 × event weight | none |
| GitHub: active coding days | 3 per day | 60 |
| GitHub: merged PRs | 5 each | 40 |
| Streak bonus (consecutive weeks with an update) | +5 per week | 30 |

Only rankable members are scored: `active` and not `exclude_from_rankings` (see §4a). Likes count by who *received* them, so an exec's like on someone's update still counts for that person.

Keep all weights in one config file (`lib/scoring/config.ts`) so organizers can tweak them. Also store a score breakdown with every snapshot so anyone can see *why* they rank where they do.

## 6. Phases

### Phase 0: Scaffold
- Next.js + TS + Tailwind + shadcn/ui; ESLint/Prettier; `.env.example`
- Supabase client helpers (browser + server + service role)
- `CLAUDE.md` with project conventions
- **Done when:** `npm run dev` shows a placeholder page and the repo is committed.

### Phase 1: GroupMe ingestion
- `scripts/list-groups.ts`: prints your groups and their IDs
- `lib/groupme.ts`: client for `GET https://api.groupme.com/v3/groups/:id/messages` (paginated with `before_id`, 100 per page; incremental with `after_id`, because `since_id` skips messages when more than 100 arrive) and `GET /groups/:id` for the member list
- Backfill script: pulls the full history of the main chat **and every subtopic** ("Goals & Progress", "Introductions", "Resources"; each is read via `/groups/:subtopic_id/messages`) and upserts `members`, `member_identities`, `messages` (idempotent on message id). Each channel keeps its own cursor (`sync_runs.source = 'groupme:<channel id>'`), and new subtopics are picked up automatically.
- `POST /api/cron/sync-groupme`: incremental sync that saves its cursor in `sync_runs`
- `scripts/set-exec.ts`: takes GroupMe names or user ids and marks those members `role='admin'` + `exclude_from_rankings=true` (§4a)
- **Done when:** the full history is in Supabase, and running the sync twice creates no duplicates.

### Phase 2: AI message scoring
- `lib/scoring/classify.ts`: batches unscored messages (20 per call) and asks `claude-haiku-5-5` (effort `medium`: same category accuracy as `low` in the eval, but much better substance scores, for about $0.10 per 1,000 messages) for structured JSON output: `{ref, category, substance, summary}`. Short refs (`m1`…) are sent instead of GroupMe ids, along with channel name, a has-media flag and the replied-to text. No member names are sent.
- Classification rules (confirmed by organizers): shipped requires evidence; introductions are always chatter; weekly goal posts are progress updates, and only substance ≥ 2 earns points. The classifier also extracts the `project` name, so a shipped post counts once per member per project (names are normalized, e.g. "C-art-ion" = "Cartion").
- Uses the regular Messages API for now. Requests are plain `MessageCreateParamsNonStreaming` run through a swappable executor (`lib/scoring/score-messages.ts`), so moving to the Batch API (50% cheaper) only means adding a batch executor.
- Messages with no valid result (refusal, truncation, bad JSON) stay unscored and are retried next run.
- Skip messages under 15 characters, bot or system messages, and messages from excluded (exec board) members, so they cost nothing
- `POST /api/cron/score-messages` / `npm run score-messages`: each run logs token usage, cost and cost per 1,000 messages in `sync_runs.stats`
- Eval set: about 20 real messages with Claude-proposed labels that an organizer corrects (`evals/message-labels.json` holds ids only, so no message text goes into git), plus `npm run eval:classifier`, which reports category accuracy, substance accuracy (exact and ±1), whether points would be awarded the same way, and cost
- **Done when:** every eligible message is scored, the eval set is at least 80% accurate, and the cost per 1,000 messages is logged.

### Phase 3: Attendance (organizer-only)
- `/admin/events`: create and edit events
- `/admin/checkin/[eventId]`: a mobile-first grid of member avatars with names; tap to mark someone present (optimistic UI), plus search. Exec board members are hidden by default, and no attendance rows are created for them.
- `scripts/import-attendance.ts`: imports your historical CSV, fuzzy-matching names to members, and prints any it couldn't match. Rows for excluded members are skipped and reported.
- **Done when:** an organizer can take attendance for 30 people in under a minute on a phone.

### Phase 4: Scores, the leaderboard UI, and auth
- Supabase magic-link login, limited to emails in `members` (or `@lehigh.edu`)
- `lib/scoring/compute.ts` → `score_snapshots` for the current month and all time; `POST /api/cron/compute-scores`. It only computes for `ranked_members` and ranks with `rankMembers()`.
- Pages:
  - `/leaderboard`: top-3 podium (animated), a full ranked list with rank change ▲▼, a month / all-time toggle, and filters
  - `/builders/[id]`: profile with score breakdown, activity heatmap, streak 🔥, badges, recent updates (with Claude's summaries), and events attended
  - `/stats`: group-wide charts (updates per week, attendance trend, most active days and hours), counting only `ranked_members`
  - Exec board members don't appear on the leaderboard and have no score breakdown, streak or badges on their profiles
- **Done when:** a logged-in member sees real rankings, and a logged-out visitor sees nothing.

### Phase 5: GitHub
- `/admin/members`: link GitHub usernames, fix any GroupMe ↔ member mismatches, and toggle exec board status (sets admin + `exclude_from_rankings`)
- Don't count GitHub activity for excluded members
- `lib/github.ts`: a GraphQL `contributionsCollection(from, to)` query per user for daily commit counts and PRs
- `POST /api/cron/sync-github` (nightly)
- **Done when:** GitHub components show up in scores and on profiles.

### Phase 6: Badges and Builder of the Month
- Badge rules engine (`lib/badges/rules.ts`), run after scores are computed, for rankable members only. "Most likes" and "every event" comparisons ignore excluded members. Starter badges:
  - **Shipper**: 3+ shipped posts
  - **Never Misses**: attended every event this month
  - **On Fire**: 4-week update streak
  - **Night Owl**: 5+ updates posted after midnight
  - **Crowd Favorite**: most likes in a month
  - **Helper**: 5+ `help_given`
- `/admin/awards`: the month's top 5 rankable members with breakdowns (exec board can't be candidates); an admin picks the winner and writes a note
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
- Anything scored, ranked, badged, awarded or counted in stats goes through `ranked_members` / `isRankable()`. Never filter excluded members ad hoc.
- No public routes yet. Everything except `/login` requires auth.

## 8. Later: hook into the public site
The public Builder Society site will live in the same Next.js app. Public pages read from a `public_stats` view (aggregates, plus featured builders who said yes) and never from raw tables.

## 9. Open decisions (answer when you get there)
- Login: members' school emails, or a fixed allowlist?
- Can members see the full ranking, or only the top 10 plus their own rank?
- Event weights (e.g., hackathon = 2×)?
- ~~Should anyone be excluded from rankings (e.g., e-board)?~~ Decided: yes, the exec board (§4a).
