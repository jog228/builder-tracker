// Moves GroupMe data into Supabase. Shared by the backfill script and the cron route.
// Everything here is idempotent: members key on groupme_user_id, messages on GroupMe id.
//
// A group has a main chat plus subtopics ("Goals & Progress", ...). Each one is a
// channel with its own message stream and its own cursor (sync_runs.source =
// "groupme:<channel id>").
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getGroup,
  listSubgroups,
  messagesBackward,
  messagesForward,
  type GroupMeMessage,
} from "./groupme";

// Likes keep arriving after a message is posted, so each sync re-reads this window.
const LIKE_REFRESH_DAYS = 7;
// Attachment types that mean real content (not reply/mention metadata).
const CONTENT_ATTACHMENTS = new Set(["image", "linked_image", "video", "file"]);

type Sender = { groupmeUserId: string; name: string; avatarUrl: string | null };
type MemberMap = Map<string, string>; // groupme_user_id → members.id
type Channel = { id: string; name: string };

export type ChannelResult = {
  channel: string;
  runId: number;
  messagesUpserted: number;
  cursor: string | null;
};

export type SyncResult = {
  membersCreated: number;
  messagesUpserted: number;
  channels: ChannelResult[];
};

function groupId(): string {
  const id = process.env.GROUPME_GROUP_ID;
  if (!id) throw new Error("GROUPME_GROUP_ID is not set");
  return id;
}

const sourceFor = (channel: Channel) => `groupme:${channel.id}`;

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

function toRow(m: GroupMeMessage, channel: Channel, members: MemberMap) {
  const isUser = m.sender_type === "user" && !m.system;
  return {
    id: m.id,
    channel_id: channel.id,
    channel_name: channel.name,
    member_id: isUser ? (members.get(m.sender_id) ?? null) : null,
    sender_groupme_id: m.sender_id,
    sender_type: m.system ? "system" : m.sender_type,
    text: m.text,
    created_at: new Date(m.created_at * 1000).toISOString(),
    like_count: m.favorited_by.length,
    liked_by: m.favorited_by,
    has_attachment: m.attachments.some((a) => CONTENT_ATTACHMENTS.has(a.type)),
    reply_to_id:
      (m.attachments.find((a) => a.type === "reply")?.reply_id as
        string | undefined) ?? null,
    raw: m,
  };
}

/** Upserts one page of messages, creating members for any unknown senders. */
async function savePage(
  db: SupabaseClient,
  page: GroupMeMessage[],
  channel: Channel,
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
    page.map((m) => toRow(m, channel, members)),
    { onConflict: "id" },
  );
  if (error) throw error;
  return page.length;
}

/** Newest message id from the last run of this channel that recorded one. */
async function lastCursor(
  db: SupabaseClient,
  channel: Channel,
): Promise<string | null> {
  const { data, error } = await db
    .from("sync_runs")
    .select("cursor")
    .eq("source", sourceFor(channel))
    .not("cursor", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0]?.cursor ?? null;
}

/** Wraps one channel's sync in a sync_runs row so failures are recorded. */
async function withRun(
  db: SupabaseClient,
  channel: Channel,
  body: (
    runId: number,
  ) => Promise<{ messagesUpserted: number; cursor: string | null }>,
): Promise<ChannelResult> {
  const { data, error } = await db
    .from("sync_runs")
    .insert({ source: sourceFor(channel) })
    .select("id")
    .single();
  if (error) throw error;
  const runId: number = data.id;

  const finish = (patch: Record<string, unknown>) =>
    db
      .from("sync_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);

  try {
    const result = await body(runId);
    await finish({ status: "success", cursor: result.cursor });
    return { channel: channel.name, runId, ...result };
  } catch (err) {
    await finish({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** The main chat plus every subtopic, and the member list. */
async function loadGroup(db: SupabaseClient) {
  const group = await getGroup(groupId());
  const subgroups = await listSubgroups(group.id);
  const channels: Channel[] = [
    { id: group.id, name: "Main" },
    ...subgroups.map((s) => ({ id: s.id, name: s.topic })),
  ];
  const { map: members, created } = await ensureMembers(
    db,
    (group.members ?? []).map((m) => ({
      groupmeUserId: m.user_id,
      name: m.nickname,
      avatarUrl: m.image_url,
    })),
  );
  return { channels, members, created };
}

function summarize(
  created: number,
  members: MemberMap,
  before: number,
  channels: ChannelResult[],
): SyncResult {
  return {
    membersCreated: created + (members.size - before),
    messagesUpserted: channels.reduce((n, c) => n + c.messagesUpserted, 0),
    channels,
  };
}

/** Pulls the full history of every channel (newest → oldest). Safe to re-run. */
export async function backfillGroupMe(
  db: SupabaseClient,
  log: (msg: string) => void = () => {},
): Promise<SyncResult> {
  const { channels, members, created } = await loadGroup(db);
  const before = members.size;
  log(`members: ${members.size} known, ${created} created`);

  const results: ChannelResult[] = [];
  for (const channel of channels) {
    results.push(
      await withRun(db, channel, async () => {
        let newest: string | null = null;
        let count = 0;
        for await (const page of messagesBackward(channel.id)) {
          newest ??= page[0].id;
          count += await savePage(db, page, channel, members);
        }
        log(`${channel.name}: ${count} messages`);
        return {
          messagesUpserted: count,
          cursor: newest ?? (await lastCursor(db, channel)),
        };
      }),
    );
  }
  return summarize(created, members, before, results);
}

/**
 * Incremental sync of every channel: new messages after the saved cursor, plus
 * a re-read of the last LIKE_REFRESH_DAYS so like counts stay current.
 * A channel with no cursor yet (e.g. a new subtopic) gets a full backfill.
 */
export async function syncGroupMe(db: SupabaseClient): Promise<SyncResult> {
  const { channels, members, created } = await loadGroup(db);
  const before = members.size;
  const cutoff = Date.now() / 1000 - LIKE_REFRESH_DAYS * 86400;

  const results: ChannelResult[] = [];
  for (const channel of channels) {
    results.push(
      await withRun(db, channel, async (runId) => {
        const start = await lastCursor(db, channel);
        let cursor = start;
        let count = 0;

        if (start) {
          for await (const page of messagesForward(channel.id, start)) {
            count += await savePage(db, page, channel, members);
            cursor = page[page.length - 1].id;
            // Save progress so a crash mid-sync resumes from here.
            await db.from("sync_runs").update({ cursor }).eq("id", runId);
          }
        }

        for await (const page of messagesBackward(channel.id)) {
          cursor ??= page[0].id;
          const recent = start
            ? page.filter((m) => m.created_at >= cutoff)
            : page;
          if (recent.length)
            count += await savePage(db, recent, channel, members);
          if (recent.length < page.length) break;
        }

        return { messagesUpserted: count, cursor };
      }),
    );
  }
  return summarize(created, members, before, results);
}
