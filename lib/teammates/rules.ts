// Teammates: pure helpers shared by the profile, the respond page and the
// server actions. The database (request_teammate() etc., see
// supabase/migrations/20261102000000_teammates.sql) enforces the rules; this
// turns its results into what the UI shows.
import { dayLabel } from "@/lib/format";

export const DECLINE_COOLDOWN_DAYS = 30;

export type TeammateMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type LinkRow = {
  id: string;
  status: "pending" | "confirmed" | "declined";
  requester_id: string;
  recipient_id: string;
  email_status: "sent" | "failed" | null;
  requester: MemberRef | MemberRef[] | null;
  recipient: MemberRef | MemberRef[] | null;
};
type MemberRef = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type TeammateEntry = { linkId: string; member: TeammateMember };

export type TeammateLists = {
  confirmed: TeammateEntry[];
  /** Requests others sent this member (only loaded for the owner). */
  incoming: TeammateEntry[];
  /** Requests this member sent, still pending (only loaded for the owner). */
  outgoing: (TeammateEntry & { emailFailed: boolean })[];
};

const ref = (r: MemberRef | MemberRef[] | null) =>
  Array.isArray(r) ? r[0] : r;

/**
 * Splits a member's links into confirmed / incoming / outgoing, each with the
 * *other* person. Declined rows never show. Sorted by name.
 */
export function partitionLinks(
  rows: LinkRow[],
  memberId: string,
): TeammateLists {
  const out: TeammateLists = { confirmed: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const mine = r.requester_id === memberId;
    if (!mine && r.recipient_id !== memberId) continue;
    const other = ref(mine ? r.recipient : r.requester);
    if (!other) continue;
    const entry = {
      linkId: r.id,
      member: {
        id: other.id,
        name: other.display_name,
        avatarUrl: other.avatar_url,
      },
    };
    if (r.status === "confirmed") out.confirmed.push(entry);
    else if (r.status === "pending" && mine)
      out.outgoing.push({ ...entry, emailFailed: r.email_status === "failed" });
    else if (r.status === "pending") out.incoming.push(entry);
  }
  const byName = (a: TeammateEntry, b: TeammateEntry) =>
    a.member.name.localeCompare(b.member.name);
  out.confirmed.sort(byName);
  out.incoming.sort(byName);
  out.outgoing.sort(byName);
  return out;
}

// ─── RPC results → action results ──────────────────────────────────────────

export type RequestOutcome =
  | { ok: true; status: "pending" | "confirmed"; linkId: string }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** request_teammate() result → what the picker shows. */
export function requestOutcome(res: {
  result: string;
  link_id?: string;
  until?: string;
}): RequestOutcome {
  switch (res.result) {
    case "pending":
    case "confirmed":
      return { ok: true, status: res.result, linkId: res.link_id! };
    case "self":
      return { ok: false, status: 400, error: "You can't add yourself." };
    case "not_roster":
      return {
        ok: false,
        status: 404,
        error: "Pick someone on the Builder Society roster.",
      };
    case "already_teammates":
      return { ok: false, status: 409, error: "You're already teammates." };
    case "already_pending":
      return {
        ok: false,
        status: 409,
        error: "You already sent them a request.",
      };
    case "cooldown":
      return {
        ok: false,
        status: 409,
        error: `You can't send them another request until ${res.until ? dayLabel(res.until) : "later"}.`,
      };
    default:
      return { ok: false, status: 400, error: "Something went wrong." };
  }
}

export type TokenResult =
  | "ok"
  | "invalid"
  | "not_yours"
  | "used"
  | "expired"
  | "confirmed"
  | "declined"
  | "not_found";

/** Friendly copy for an email link that can't be used. */
export function tokenProblem(
  result: TokenResult,
  info: { status?: string; requesterName?: string | null } = {},
): { title: string; body: string } | null {
  const who = info.requesterName ?? "they";
  switch (result) {
    case "ok":
    case "confirmed":
    case "declined":
      return null;
    case "used":
      return info.status === "confirmed"
        ? {
            title: "Already confirmed",
            body: `You and ${who} are already teammates.`,
          }
        : {
            title: "Link already used",
            body: "This link has already been used. Any open requests are on your builder file.",
          };
    case "expired":
      return {
        title: "This link expired",
        body: `Links work for 14 days. ${who === "they" ? "The request" : `${who}'s request`} is still on your builder file, so you can answer it there.`,
      };
    case "not_yours":
      return {
        title: "Wrong account",
        body: "This request was sent to a different builder. Sign out and sign in with the Lehigh account the email went to.",
      };
    case "invalid":
    case "not_found":
    default:
      return {
        title: "Link doesn't work",
        body: "This link isn't valid anymore. The request may have been answered or removed.",
      };
  }
}
