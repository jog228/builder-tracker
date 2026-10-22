// Moves GroupMe data into Supabase. Shared by the backfill script and the cron route.
// Everything here is idempotent: members key on groupme_user_id, messages on GroupMe id.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getGroup,
  messagesBackward,
  messagesForward,
  type GroupMeMessage,
} from "./groupme";

const SOURCE = "groupme";
// Likes keep arriving after a message is posted, so each sync re-reads this window.
const LIKE_REFRESH_DAYS = 7;
// Attachment types that mean real content (not reply/mention metadata).
const CONTENT_ATTACHMENTS = new Set(["image", "linked_image", "video", "file"]);

type Sender = { groupmeUserId: string; name: string; avatarUrl: string | null };
type MemberMap = Map<string, string>; // groupme_user_id → members.id

export type SyncResult = {
  runId: number;
  messagesUpserted: number;
  membersCreated: number;
  cursor: string | null;
};

function groupId(): string {
  const id = process.env.GROUPME_GROUP_ID;
  if (!id) throw new Error("GROUPME_GROUP_ID is not set");
  return id;
}

/** Creates a member + identity for every GroupMe user we haven't seen yet. */
async function ensureMembers(
  db: SupabaseClient,
  senders: Sender[],
): Promise<{ map: MemberMap; created: number }> {
  const { data, error } = await db
    .from("member_identities")
    .select("member_id, groupme_user_id")
    .not("groupme_user_id", "is", null);
  if (error) throw error;

  const map: MemberMap = new Map(
    data.map((r) => [r.groupme_user_id as string, r.member_id as string]),
  );
  let created = 0;

  for (const s of senders) {
    if (map.has(s.groupmeUserId)) continue;
    const { data: member, error: mErr } = await db
      .from("members")
      .insert({ display_name: s.name, avatar_url: s.avatarUrl })
      .select("id")
      .single();
    if (mErr) throw mErr;
    const { error: iErr } = await db
      .from("member_identities")
      .insert({ member_id: member.id, groupme_user_id: s.groupmeUserId });
    if (iErr) {
      await db.from("members").delete().eq("id", member.id);
      throw iErr;
    }
    map.set(s.groupmeUserId, member.id);
    created++;
  }
  return { map, created };
}

function toRow(m: GroupMeMessage, members: MemberMap) {
  const isUser = m.sender_type === "user" && !m.system;
  return {
    id: m.id,
    member_id: isUser ? (members.get(m.sender_id) ?? null) : null,
    sender_groupme_id: m.sender_id,
    sender_type: m.system ? "system" : m.sender_type,
    text: m.text,
    created_at: new Date(m.created_at * 1000).toISOString(),
    like_count: m.favorited_by.length,
    liked_by: m.favorited_by,
    has_attachment: m.attachments.some((a) => CONTENT_ATTACHMENTS.has(a.type)),
    raw: m,
  };
}

/** Upserts one page of messages, creating members for any unknown senders. */
async function savePage(
  db: SupabaseClient,
  page: GroupMeMessage[],
  members: MemberMap,
): Promise<number> {
  const unknown = new Map<string, Sender>();
  for (const m of page) {
    if (m.sender_type === "user" && !m.system && !members.has(m.sender_id)) {
      unknown.set(m.sender_id, {
        groupmeUserId: m.sender_id,
        name: m.name,
        avatarUrl: m.avatar_url,
      });
    }
  }
  if (unknown.size) {
    const { map } = await ensureMembers(db, [...unknown.values()]);
    map.forEach((v, k) => members.set(k, v));
  }

  const { error } = await db.from("messages").upsert(
    page.map((m) => toRow(m, members)),
    { onConflict: "id" },
  );
  if (error) throw error;
  return page.length;
}

async function startRun(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from("sync_runs")
    .insert({ source: SOURCE })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function finishRun(
  db: SupabaseClient,
  runId: number,
  patch: {
    status: "success" | "error";
    cursor?: string | null;
    error?: string;
  },
) {
  await db
    .from("sync_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Newest message id from the last run that recorded one (success or partial). */
async function lastCursor(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db
    .from("sync_runs")
    .select("cursor")
    .eq("source", SOURCE)
    .not("cursor", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0]?.cursor ?? null;
}

async function syncGroupMembers(db: SupabaseClient) {
  const group = await getGroup(groupId());
  return ensureMembers(
    db,
    (group.members ?? []).map((m) => ({
      groupmeUserId: m.user_id,
      name: m.nickname,
      avatarUrl: m.image_url,
    })),
  );
}

/** Wraps a sync body in a sync_runs row so failures are recorded. */
async function withRun(
  db: SupabaseClient,
  body: (runId: number) => Promise<Omit<SyncResult, "runId">>,
): Promise<SyncResult> {
  const runId = await startRun(db);
  try {
    const result = await body(runId);
    await finishRun(db, runId, { status: "success", cursor: result.cursor });
    return { runId, ...result };
  } catch (err) {
    await finishRun(db, runId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Pulls the full history (newest → oldest). Safe to re-run. */
export function backfillGroupMe(
  db: SupabaseClient,
  log: (msg: string) => void = () => {},
): Promise<SyncResult> {
  return withRun(db, async () => {
    const { map: members, created } = await syncGroupMembers(db);
    log(`members: ${members.size} known, ${created} created`);

    let newest: string | null = null;
    let count = 0;
    const before = members.size;
    for await (const page of messagesBackward(groupId())) {
      newest ??= page[0].id;
      count += await savePage(db, page, members);
      log(`messages: ${count}`);
    }
    return {
      messagesUpserted: count,
      membersCreated: created + (members.size - before),
      cursor: newest ?? (await lastCursor(db)),
    };
  });
}

/**
 * Incremental sync: new messages after the saved cursor, plus a re-read of the
 * last LIKE_REFRESH_DAYS so like counts stay current.
 */
export function syncGroupMe(db: SupabaseClient): Promise<SyncResult> {
  return withRun(db, async (runId) => {
    const start = await lastCursor(db);
    if (!start)
      throw new Error("No GroupMe cursor yet. Run the backfill first.");

    const { map: members, created } = await syncGroupMembers(db);
    const before = members.size;
    let cursor = start;
    let count = 0;

    for await (const page of messagesForward(groupId(), start)) {
      count += await savePage(db, page, members);
      cursor = page[page.length - 1].id;
      // Save progress so a crash mid-sync resumes from here.
      await db.from("sync_runs").update({ cursor }).eq("id", runId);
    }

    const cutoff = Date.now() / 1000 - LIKE_REFRESH_DAYS * 86400;
    for await (const page of messagesBackward(groupId())) {
      const recent = page.filter((m) => m.created_at >= cutoff);
      if (recent.length) count += await savePage(db, recent, members);
      if (recent.length < page.length) break;
    }

    return {
      messagesUpserted: count,
      membersCreated: created + (members.size - before),
      cursor,
    };
  });
}
