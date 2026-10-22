// Minimal GroupMe v3 API client. Docs: https://dev.groupme.com/docs/v3
// Server-side only: reads GROUPME_TOKEN from env. Used by scripts and cron routes.

const BASE = "https://api.groupme.com/v3";
const PAGE_SIZE = 100; // API max for messages

export type GroupMeGroup = {
  id: string;
  name: string;
  members?: GroupMeMember[];
  messages?: { count: number; last_message_id: string };
};

export type GroupMeMember = {
  id: string; // membership id (per group)
  user_id: string; // stable GroupMe user id
  nickname: string;
  image_url: string | null;
};

export type GroupMeAttachment = { type: string; [key: string]: unknown };

export type GroupMeMessage = {
  id: string;
  created_at: number; // unix seconds
  user_id: string;
  sender_id: string;
  sender_type: "user" | "bot" | "system" | string;
  system: boolean;
  name: string;
  avatar_url: string | null;
  text: string | null;
  attachments: GroupMeAttachment[];
  favorited_by: string[]; // GroupMe user ids
};

async function gm<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T | null> {
  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error("GROUPME_TOKEN is not set");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "X-Access-Token": token } });
    // GroupMe answers 304 when a message page is empty.
    if (res.status === 304) return null;
    if (res.ok) return ((await res.json()) as { response: T }).response;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `GroupMe ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
}

export async function listGroups(): Promise<GroupMeGroup[]> {
  const all: GroupMeGroup[] = [];
  for (let page = 1; ; page++) {
    const groups = await gm<GroupMeGroup[]>("/groups", {
      page,
      per_page: 100,
      omit: "memberships",
    });
    if (!groups?.length) return all;
    all.push(...groups);
  }
}

export async function getGroup(groupId: string): Promise<GroupMeGroup> {
  const group = await gm<GroupMeGroup>(`/groups/${groupId}`);
  if (!group) throw new Error(`Group ${groupId} not found`);
  return group;
}

/**
 * Walks the full history, newest → oldest, using before_id.
 * Yields one page (≤100 messages) at a time.
 */
export async function* messagesBackward(
  groupId: string,
  beforeId?: string,
): AsyncGenerator<GroupMeMessage[]> {
  let cursor = beforeId;
  for (;;) {
    const page = await gm<{ messages: GroupMeMessage[] }>(
      `/groups/${groupId}/messages`,
      { limit: PAGE_SIZE, before_id: cursor },
    );
    const msgs = page?.messages ?? [];
    if (!msgs.length) return;
    yield msgs;
    cursor = msgs[msgs.length - 1].id;
  }
}

/**
 * Walks forward from a known message id, oldest → newest, using after_id.
 * (since_id returns the *newest* 100 after the id, which can skip messages
 * when more than 100 arrived, so incremental sync uses after_id instead.)
 */
export async function* messagesForward(
  groupId: string,
  afterId: string,
): AsyncGenerator<GroupMeMessage[]> {
  let cursor = afterId;
  for (;;) {
    const page = await gm<{ messages: GroupMeMessage[] }>(
      `/groups/${groupId}/messages`,
      { limit: PAGE_SIZE, after_id: cursor },
    );
    const msgs = page?.messages ?? [];
    if (!msgs.length) return;
    yield msgs;
    cursor = msgs[msgs.length - 1].id;
  }
}
