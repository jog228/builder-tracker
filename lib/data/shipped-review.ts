import "server-only";
import { one } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type Media = {
  type: "image" | "video" | "link";
  url: string;
  preview?: string;
};

export type QueueItem = {
  messageId: string;
  priority: number;
  source: "classifier" | "manual";
  createdAt: string;
  text: string;
  channel: string;
  memberId: string;
  name: string;
  substance: number | null;
  summary: string | null;
  project: string | null;
  media: Media[];
};

export type Decision = {
  messageId: string;
  status: "shipped" | "progress";
  decidedAt: string;
  decidedBy: string | null;
  name: string;
  memberId: string;
  project: string | null;
  summary: string | null;
};

function mediaOf(attachments: unknown, text: string): Media[] {
  const out: Media[] = [];
  for (const a of (Array.isArray(attachments) ? attachments : []) as Record<
    string,
    string
  >[]) {
    if (a.type === "image" || a.type === "linked_image")
      out.push({ type: "image", url: a.url });
    if (a.type === "video")
      out.push({ type: "video", url: a.url, preview: a.preview_url });
  }
  for (const url of text.match(/https?:\/\/\S+/g) ?? []) {
    if (!out.some((m) => m.url === url))
      out.push({
        type: url.includes("groupme.com/uploads") ? "video" : "link",
        url,
      });
  }
  return out;
}

export async function getShippedReview() {
  const supabase = await createClient();
  const [queue, decided] = await Promise.all([
    supabase
      .from("shipped_review_queue")
      .select(
        "message_id, priority, source, created_at, text, channel_name, member_id, display_name, substance, summary, project",
      ),
    supabase
      .from("shipped_approvals")
      .select(
        "message_id, status, decided_at, decider:members!shipped_approvals_decided_by_fkey(display_name), messages(member_id, members(display_name), message_scores(summary, project))",
      )
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(30),
  ]);
  if (queue.error) throw queue.error;

  const ids = (queue.data ?? []).map((q) => q.message_id);
  const { data: raws } = ids.length
    ? await supabase
        .from("messages")
        .select("id, attachments:raw->attachments")
        .in("id", ids)
    : { data: [] };
  const attachmentsBy = new Map((raws ?? []).map((r) => [r.id, r.attachments]));

  const items: QueueItem[] = (queue.data ?? []).map((q) => ({
    messageId: q.message_id,
    priority: q.priority,
    source: q.source,
    createdAt: q.created_at,
    text: q.text ?? "",
    channel: q.channel_name ?? "Main",
    memberId: q.member_id,
    name: q.display_name,
    substance: q.substance,
    summary: q.summary,
    project: q.project,
    media: mediaOf(attachmentsBy.get(q.message_id), q.text ?? ""),
  }));

  const history: Decision[] = (decided.data ?? []).map((d) => {
    type Embedded = {
      member_id: string;
      members: Named | Named[] | null;
      message_scores: Score | Score[] | null;
    };
    type Named = { display_name: string };
    type Score = { summary: string | null; project: string | null };
    const msg = one(d.messages as unknown as Embedded | Embedded[]);
    const score = one(msg?.message_scores ?? null);
    return {
      messageId: d.message_id,
      status: d.status as "shipped" | "progress",
      decidedAt: d.decided_at!,
      decidedBy:
        one(d.decider as unknown as Named | Named[])?.display_name ?? null,
      name: one(msg?.members ?? null)?.display_name ?? "Unknown",
      memberId: msg?.member_id ?? "",
      project: score?.project ?? null,
      summary: score?.summary ?? null,
    };
  });

  return { items, history };
}
