# Builder Society — Private Builder Tracker: Build Plan

> Drop this file in the root of a new repo and tell Claude Code:
> **"Read PLAN.md. We're starting Phase 0. Do only that phase, then stop so I can review."**
> Do one phase per session. Commit after each phase.

---

## 1. Goal

An internal, members-only web app that ranks Builder Society members by how much they build, **with zero effort from members**. It runs entirely in the background, pulling data from:

1. **GroupMe**: progress updates, shipped projects, peer likes
2. **Attendance**: an exec board admin taps names on a check-in page at each weekly meeting (members do nothing)
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
- ~~Your existing manual attendance records, exported as a CSV~~ Not needed: Phase 3 starts fresh with no history import.

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
message_scores     message_id, category ('progress_update'|'shipped_candidate'|'help_given'|
                   'event_related'|'chatter'), substance (0-3), summary, project, model, scored_at
shipped_approvals  message_id, status ('pending'|'shipped'|'progress'), source ('classifier'|
                   'manual'), priority, queued_at, decided_by, decided_at, note
shipped_review_queue  view: pending approvals with message, member and score, by priority then date
project_aliases    id, member_id, alias, canonical, created_by, created_at
events             id, name, date, type ('meeting'|'workshop'|'hackathon'|'social'), weight,
                   weekly (bool; one per date), created_by, created_at
attendance         event_id, member_id, recorded_by (required), recorded_at (server time)
github_activity    member_id, date, commits, prs_opened, prs_merged, repos (text[])
token_usage        member_id, date, tokens   -- Phase 7, optional
score_snapshots    member_id, period ('2026-10' | 'all'), components (jsonb),
                   total, rank, computed_at
badges             id, slug, name, description, icon
member_badges      member_id, badge_id, earned_at
awards             id, period, member_id, title ('Builder of the Month'), note
bonus_points       id, member_id, event_id (nullable), type ('demo'|'other'), points,
                   reason, awarded_by, awarded_at, revoked_at, revoked_by
sync_runs          id, source, started_at, finished_at, status, cursor, error
```

Row-level security: members can read everything (it's internal); only `role='admin'` can write `attendance`, `events`, `member_identities`, and `awards`. Admins mark attendance and create events only as themselves (`recorded_by` / `created_by` = their member id), and a trigger stamps `recorded_at` with the server clock. Admins can award `bonus_points` (only as themselves) and revoke them, but nobody can delete them, so the award log stays complete. Only the service role (used by cron jobs) can write everything else.

## 4a. Exec board exclusion

Exec board members get `role='admin'` and `exclude_from_rankings=true`. Mark them with `npm run set-exec -- "<GroupMe name or user id>" ...` (later, a toggle on `/admin/members`).

- **Still ingested:** their GroupMe messages sync like everyone else's, so the history stays complete.
- **Never scored:** AI scoring skips their messages (no API cost).
- **Never counted:** they never count toward any score, streak, badge, stat or award. They're left out of the leaderboard, Builder of the Month candidates, group-wide stats and `score_snapshots`.
- **Attendance:** no attendance rows are created for them, and they're hidden from the check-in grid by default.
- **Likes they give still count:** a like from an exec on another member's update counts for that member.
- **One rule in code:** anything scored reads from the `ranked_members` view or calls `isRankable()` (`lib/scoring/eligibility.ts`).
- **Database backstop:** triggers reject `attendance`, `score_snapshots`, `member_badges`, `awards`, `bonus_points` and `message_scores` rows for excluded members. An existing bonus can still be revoked after its holder joins the exec board.
- **When someone is excluded:** their snapshots, badges and message scores are deleted. Past attendance and awards are kept as history but filtered out at read time.
- **Tested:** a unit test (`lib/scoring/rank.test.ts`) proves an excluded member never appears in rankings.

## 5. Scoring v1 (tune later)

Monthly score = sum of these components. Nothing is capped: every item counts in full.

| Component | Points |
|---|---|
| Progress update (substance ≥ 1, `UPDATE_MIN_SUBSTANCE`; 0 and chatter score nothing) | 10 each |
| "Shipped" post: the classifier flags `shipped_candidate`, which counts **only after an exec member approves it**; once per member per project (`countableShipped()`, alias-aware) | 25 each |
| Helping others (`help_given`), including sharing a useful article, link or tool in any channel | 5 each |
| Likes received on update/shipped posts | 1 each |
| Event attended | 15 × event weight |
| GitHub: active coding days | 3 per day |
| GitHub: merged PRs | 5 each |
| Streak bonus (consecutive weeks with a detailed update, substance ≥ 2, `STREAK_MIN_SUBSTANCE`; same rule for the profile/leaderboard streak and the streak badge) | +5 per week |
| Bonus points (manual: demos and "other") | demo default 30 (`BONUS.demoPoints`), admins can override; any amount for "other" |
| Community help (`BONUS.community`: +5 or +10 from a profile, reason shown publicly) | +5 / +10 |

Only rankable members are scored: `active` and not `exclude_from_rankings` (see §4a). Likes count by who *received* them, so an exec's like on someone's update still counts for that person.

**Bonus points** (`bonus_points`, logic in `lib/scoring/bonus.ts`):
- A demo counts once per member per event. A partial unique index enforces this; revoked demos don't count.
- Awarding a demo also marks the member present at that event (a database trigger inserts the attendance row). Revoking the demo leaves attendance as it is.
- "Other" bonuses need a reason (e.g. "helped run the workshop") and can have an event or not.
- Bonuses are uncapped and get their own line in the score breakdown. They show on profiles with their reason, e.g. "🎤 Demoed at Hack Night +30".
- Undo is a soft revoke (`revoked_at` / `revoked_by`), never a delete.
- Exec board members can't receive bonuses.

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
- `lib/scoring/classify.ts`: batches unscored messages (20 per call) and asks `claude-haiku-5-5` (effort `medium`: same category accuracy as `low` in the eval, but much better substance scores, for about $0.10 per 1,000 messages) for structured JSON output: `{ref, category, substance, summary, project}`. Short refs (`m1`…) are sent instead of GroupMe ids, along with an anonymous per-batch author key (`a1`…), the author's known projects from earlier messages, the channel name, a has-media flag and the replied-to text. No member names are sent.
- **Project continuity:** batches run in chronological order, one after another, and each message gets its author's known projects (`author_projects`, with admin aliases applied) so the model reuses an existing name instead of inventing a new description. History was re-scored this way: Thaksheel went from 4 project names to 1, and Reid from 5 to 1. `project_aliases` lets admins merge leftover variants per member (UI in Phase 5).
- Classification rules (confirmed by organizers):
  - Shipped requires evidence.
  - Introductions are always chatter.
  - Weekly goal posts are progress updates, and only substance ≥ 2 earns points.
  - Sharing a useful article, link or tool is `help_given` in any channel.
  - The classifier also extracts the `project` name, so a shipped post counts once per member per project (names are normalized, e.g. "C-art-ion" = "Cartion", and resolved through `project_aliases`).
- **Shipped needs a human yes:** the model only outputs `shipped_candidate`. Each scoring run queues candidates in `shipped_approvals` as `pending`.
  - Until an exec member decides, the post counts as a progress update at its scored substance (`effectiveCategory()` in `lib/scoring/shipped.ts`).
  - "Yes, shipped" makes it `shipped`; "No, just progress" keeps it as progress.
  - Admins can also queue a message the model missed (`npm run flag-shipped -- <message id>`, priority 100 by default). Henry's Muggy post was flagged this way and is first in the queue.
- Uses the regular Messages API for now. Requests are plain `MessageCreateParamsNonStreaming` run through a swappable executor (`lib/scoring/score-messages.ts`), so moving to the Batch API (50% cheaper) only means adding a batch executor.
- Messages with no valid result (refusal, truncation, bad JSON) stay unscored and are retried next run.
- Skip messages under 15 characters, bot or system messages, and messages from excluded (exec board) members, so they cost nothing
- `POST /api/cron/score-messages` / `npm run score-messages`: each run logs token usage, cost and cost per 1,000 messages in `sync_runs.stats`
- Eval set: about 20 real messages with Claude-proposed labels that an organizer corrects (`evals/message-labels.json` holds ids only, so no message text goes into git), plus `npm run eval:classifier`, which reports category accuracy, substance accuracy (exact and ±1), whether points would be awarded the same way, and cost
- **Done when:** every eligible message is scored, the eval set is at least 80% accurate, and the cost per 1,000 messages is logged.

### Phase 3: Attendance (exec board only) ✅
Kept simple: weekly meetings only, no history import, no general events page yet.
- **Access, at every layer:** RLS lets only `role='admin'` insert, update or delete `events` and `attendance`, and only in their own name. The `setCheckin` server action re-checks admin and returns a 403 result otherwise. Non-admins never see the "Check-in" nav link, and `/admin/checkin` redirects them to the leaderboard. Every attendance row stores who marked it (`recorded_by`) and when (`recorded_at`, server time).
- **Weekly meetings:** one "Weekly Meeting" event per week on the day and time in `WEEKLY_MEETING` (`lib/scoring/config.ts`; Thursday 4:30 PM). It's created the first time an admin opens that week's sheet (unique per date).
- **`/admin/checkin`:** opens to this week's meeting, with a week picker back to the season's first meeting (`SEASON_START` = 2026-10-01, labeled "Kickoff · Thu, Oct 1"; never earlier) for fixing a missed week. Back-filled check-ins keep the meeting's date, so they score in that meeting's month, and they recompute scores like any other change. The server refuses meetings before the season. It's styled as the G2 "Crew sign-in" sheet: a mobile-first grid of avatars and names with search. Tap to sign someone in, or Demo to add a demo (a `demo` bonus at `BONUS.demoPoints`, which also signs them in). A live "X present" count sits in a sticky header. Exec board members are hidden. Changes save instantly (optimistic, queued per member) with an Undo toast. Un-signing someone also revokes their demo for that meeting.
- **Scoring:** attending earns `WEIGHTS.eventAttended` × the event's weight (15 pts). Scores recompute in the background after each change (`lib/scoring/recompute.ts`, coalesced), and the nightly cron catches anything missed.
- **Tests:** `lib/attendance/checkin.test.ts` (server layer: a non-admin gets a 403 with no writes, and an exec can't be marked present) and `npm run test:db` (database layer, against the real project: non-admins can't insert, update or delete attendance, create events or award demos; admins can't mark in someone else's name; nobody can mark an exec present).
- **Later:** `/admin/events` for one-off events (workshops, hackathons, with weights), `/admin/bonus` for "other" bonuses, and a history import if it's ever needed.
- **Done when:** an admin can take attendance for 30 people in under a minute on a phone.

### Phase 4: Scores, the leaderboard UI, and auth ✅ (built before Phase 3; works without attendance data)
- Supabase magic-link login, limited to emails in `members` (or `@lehigh.edu`)
  - **As built:** an allowlist, so only emails set on an active member row can log in (`npm run set-email -- <GroupMe id | name> <email | --clear>`; UI in Phase 5's `/admin/members`). GroupMe doesn't expose emails, so organizers set them.
  - On first login, `members.auth_user_id` is linked (`lib/auth.ts`). Middleware refreshes the session and sends logged-out visitors to `/login` (only `/login`, `/auth/*` and the CRON_SECRET-protected `/api/cron/*` are public). Admin pages call `requireAdmin()`.
  - Emailed links land on `/auth/callback` (PKCE). For testing, `npm run login-link -- <email>` prints a one-time link (`/auth/confirm`, token hash) without sending email.
  - For emailed links to work, the Supabase project's Auth → URL Configuration must allow `http://localhost:3000/auth/callback` (and the production URL in Phase 8).
- Scoring: `lib/scoring/compute.ts` (pure, unit-tested) with weights in `lib/scoring/config.ts`; `lib/scoring/compute-scores.ts` loads data and writes snapshots.
  - No caps: every item counts in full, and all-time is the sum of the months.
  - Months and weeks are in America/New_York.
  - A streak week is a week with a progress/shipped post of substance ≥ 2 (`STREAK_MIN_SUBSTANCE`). The +5 bonus applies to each week whose previous week also had one.
  - Rank change (▲▼) compares with the last computation on an earlier day (`score_snapshots.prev_rank`).
  - Scores recompute right after any shipped decision. Otherwise they recompute via `npm run compute-scores` or the cron route.
- `lib/scoring/compute.ts` → `score_snapshots` for the current month and all time; `POST /api/cron/compute-scores`. It only computes for `ranked_members` and ranks with `rankMembers()`.
- Pages:
  - `/leaderboard`: top-3 podium (animated), a full ranked list with rank change ▲▼, a month / all-time toggle, and filters
  - `/builders/[id]`: profile with score breakdown (bonus points as their own line), activity heatmap, streak 🔥, badges, recent updates (with Claude's summaries), events attended, and bonus awards with their reasons ("🎤 Demoed at Hack Night +30")
  - `/stats`: group-wide charts (updates per week, attendance trend, most active days and hours), counting only `ranked_members`
  - `/admin/shipped` (admin area): the shipped review queue (`shipped_review_queue`, highest priority first, then oldest). Each card shows the message, attachments, member, project and Claude's summary, with **"Yes, shipped"** and **"No, just progress"** buttons that record `decided_by` / `decided_at`. Also a "Flag for review" action on any message, and a history of decisions that an admin can change.
  - Exec board members don't appear on the leaderboard and have no score breakdown, streak or badges on their profiles
- **Done when:** a logged-in member sees real rankings, and a logged-out visitor sees nothing.
- Badges: the full starter catalog is seeded, so profiles show earned vs locked badges. The rules that award them come in Phase 6.

### Navigation lockdown ✅
- Deny-by-default route allowlist (`lib/access.ts`). Regular members can reach only the leaderboard, stats and profiles, plus sign-in and sign-out. Everything else, including `/admin/*` and any future page, redirects non-admins to `/leaderboard`. It's enforced in middleware and in each page's server code (`requireViewer` / `requireAdmin`). Admin-only server actions return 403.
- Nav: members see Leaderboard and Stats; admins also see Check-in and Permits.
- Tests: `lib/access.test.ts` (allowlist, middleware decisions, and an inventory of every page/route in `app/`) and `app/(app)/admin/actions.test.ts` (each admin action returns 403 without touching the database).

### "Now Building" profile card ✅
- A site-sign card on profiles: the member's current project (newest named project from scored updates, via `project_aliases`) and a 1–2 sentence, ~35-word present-tense summary by `claude-haiku-5-5` from their real updates in the 4 weeks before their latest one, plus "From N updates · last post Oct 17".
- `member_summaries` (member_id, project, summary, source_message_ids, update_count, last_post_at, model, generated_at, override_summary / override_by / override_at). Regenerated only when a member has a scored update the stored summary hasn't seen, at the end of the message-scoring job (no extra cron).
- Prompt rules: only facts from their posts, no hype or invented details, no names (names are redacted before sending, and a summary that names a member is rejected), at most 2 sentences.
- Fallbacks: no updates shows "No updates yet: post your progress in GroupMe to fill this in." Exec board members get no card (and a trigger rejects their rows).
- Only the profile's owner can edit their own text (stored as an override with who and when; "Reset to auto-summary" goes back). Other members and admins can only view; the save action returns 403 and RLS allows writes only on your own row.

### Community points ✅
- An admin-only "Award points" card on profiles (left column, between Score Breakdown and Badges; hidden from non-admins, the profile's owner and exec profiles): a required reason (Instagram feature, Helped at event, or Other with text) and +5 / +10, any number of times (no monthly cap).
- Stored as `bonus_points` type `community` (awarded_by, reason, date). Admin-only at every layer: RLS ("admins award" as themselves), `checkCommunityAward()` in the server action (403 otherwise), and a check constraint (5 or 10 only). Exec members can't receive them (existing trigger). Undo is a soft revoke recording who.
- Shown in the Bonus Points card and the breakdown as "Instagram feature +5 · Oct 22 · by Jolie". Scores recompute after each award or undo.

### Guest (portfolio) view ✅
- `/login` offers "Viewing as a guest? Enter password" (replacing the exec email link, which no exec relied on). `PORTFOLIO_PASSWORD` is checked on the server only, rate-limited (5 failures per IP and 30 overall per 15 minutes, `guest_login_attempts`, IPs hashed), and a correct password sets a signed, httpOnly cookie for about 7 days.
- Guests are spectators: no Supabase user, member row or ranking. They see real data on the leaderboard, profiles and /how-it-works only, read through a select-only wrapper. Nav shows Leaderboard and How it works, plus a "Guest view · read-only · Exit" banner. Every write is blocked: hidden in the UI, 403 in server actions (no member session), and the anonymous role can't read or write anything in the database.

### No caps; bars relative to #1 ✅
- Every scoring cap is gone (they were 80 progress, 75 shipped, 25 help, 30 likes, 30 streak, 60/40 GitHub per month; the database had none left). No one had reached a cap, so no totals or ranks changed.
- Leaderboard bars are relative to #1 (`barPercent()`: the leader is 100%, others points ÷ leader's, a 3% minimum for any non-zero score, empty when there are no points). Profiles show "X pts to pass [name]" (gap + 1) or "#1 — leading by X pts" (`standing()` in `lib/scoring/standing.ts`). Guests see the same.

### Meeting days ✅
- "+ New meeting" on `/admin/checkin` (admins only): date defaults to the Thursday after the latest meeting, time and title copy the latest meeting, and points stay as configured (15 sign-in, +30 demo). Create switches to the new meeting.
- One meeting per date: unique index on `events(date) where type = 'meeting'` (no duplicates existed when it was added), checked on the server too; a taken date shows "There's already a meeting on Thu, Oct 29" with a link to open it.
- The picker is date-based (`?date=`; old `?week=` links still work): season weeks plus every meeting, so future meetings appear and "Later" reaches them. Future meetings open with sign-ins locked until their date (server 409 + database trigger, which also covers demos).

### Teammates ✅
- Builders add teammates from their own profile (roster picker only). Pending until the other person confirms (Accept on their profile, or the emailed Confirm/Decline link, signed in as them). Asking someone who already asked you confirms it. Declines are hidden everywhere and the declined requester waits 30 days. Either teammate can remove a confirmed link. Leaving the roster drops all links.
- Email via Resend (`RESEND_API_KEY`, `EMAIL_FROM`); failed sends show "Resend" to the requester. Links: single-use tokens, sha256 stored, 14-day expiry.

### Phase 5: GitHub
- `/admin/members`: link GitHub usernames, fix any GroupMe ↔ member mismatches, and toggle exec board status (sets admin + `exclude_from_rankings`)
- Project aliases (on `/admin/members/[id]`): list each member's project names with message counts, and merge variants into one canonical name (writes `project_aliases`). Shipped counting and the classifier's known-projects context pick up aliases automatically.
  - **Split project** (for over-merges, e.g. Reid's LinkedIn-style vetted network filed under his earlier "tiktok internship platform"): pick a member's project, tick the messages that belong to a different project, and give that project a name. This rewrites `message_scores.project` on the ticked messages and removes any alias that would merge the two names back together. Later classifier runs see both names in `author_projects`, so the split sticks. Shipped approvals are unaffected; the once-per-project rule just treats them as separate projects from then on.
- Also in Phase 2: messages in the Introductions channel can never be shipped candidates. `applyChannelRules()` in `lib/scoring/classify.ts` enforces this after the model answers.
- Don't count GitHub activity for excluded members
- `lib/github.ts`: a GraphQL `contributionsCollection(from, to)` query per user for daily commit counts and PRs
- `POST /api/cron/sync-github` (nightly)
- **Done when:** GitHub components show up in scores and on profiles.

### Phase 6: Badges and Builder of the Month
- Badge rules engine (`lib/badges/rules.ts`), run after scores are computed, for rankable members only. "Most likes" and "every event" comparisons ignore excluded members. Starter badges:
  - **Shipper**: 3+ shipped posts
  - **Never Misses** ✅ (built early): 100% attendance for the month, i.e. every weekly meeting held that month (`meetingsHeld()`, same numbers as the profile's Events attended bar), with at least `BADGES.neverMisses.minMeetings` (2) held. Stored per month in `member_badges.period` ("Never Misses · Oct 2026"). Awarded only after the month ends, by `lib/badges/award.ts` after every score computation, and then permanent: a completed month is never revoked. During the month the tile shows "On track · 4 of 4" (or "3 of 4 this month"), with season progress in its tooltip.
  - **On Fire**: 4-week update streak
  - **Night Owl**: 5+ updates posted after midnight
  - **Crowd Favorite**: most likes in a month
  - **Helper**: 5+ `help_given`
  - **Demo Day** 🎤: demoed at 3+ different events (`BADGES.demoDayMinDemos`; the badge row is already seeded, and `earnsDemoDayBadge()` is in `lib/scoring/bonus.ts`)
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
- [ ] **TODO: separate test database.** `npm run test:db` still runs against production (`.env.local`). Create a second Supabase project, put its keys in `.env.test.local`, apply the migrations there, and make `vitest.db.config.ts` refuse to run unless it points at that project (URL differs from production's). Until then, fixtures record ids immediately, cleanup throws on failed deletes, and `tests/db/sweep.ts` removes `@example.invalid` leftovers after every run. (Added Oct 29, 2026, after two test members leaked into the live roster on Oct 24.)
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
- Login: members' school emails, or a fixed allowlist? **Built as an allowlist (`members.email`)**. Opening it to any `@lehigh.edu` address would also need a way to match a new login to the right GroupMe member.
- Can members see the full ranking, or only the top 10 plus their own rank? **Currently the full ranking** (easy to change in `RankedList`).
- Event weights (e.g., hackathon = 2×)?
- ~~Should anyone be excluded from rankings (e.g., e-board)?~~ Decided: yes, the exec board (§4a).
