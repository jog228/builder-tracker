// Check-in core: authorize, validate and reconcile one member's row on the
// sheet. The server action wires in the real store (the admin's own session,
// so RLS applies too); tests use a fake one.
import { BONUS } from "@/lib/scoring/config";

export type CheckinTarget = { present: boolean; demo: boolean };

export type CheckinRow = {
  present: boolean;
  /** Active (unrevoked) demo bonus id, if any. */
  demoId: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
};

export interface CheckinStore {
  getEvent(id: string): Promise<{
    id: string;
    name: string;
    date: string;
    weekly: boolean;
  } | null>;
  /** null if there's no such member. */
  getMember(id: string): Promise<{ active: boolean; excluded: boolean } | null>;
  getRow(eventId: string, memberId: string): Promise<CheckinRow>;
  markPresent(eventId: string, memberId: string, by: string): Promise<void>;
  unmarkPresent(eventId: string, memberId: string): Promise<void>;
  awardDemo(
    eventId: string,
    memberId: string,
    by: string,
    points: number,
    reason: string,
  ): Promise<void>;
  revokeDemo(bonusId: string, by: string): Promise<void>;
}

export type CheckinViewer = { memberId: string; isAdmin: boolean } | null;

export type CheckinResult =
  | { ok: true; row: CheckinRow }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sets one member's check-in to `target`. A demo implies present; un-marking
 * present also revokes their demo for this meeting.
 */
export async function applyCheckin(
  viewer: CheckinViewer,
  store: CheckinStore,
  input: { eventId: string; memberId: string; target: CheckinTarget },
): Promise<CheckinResult> {
  // Authorize before touching the store at all.
  if (!viewer?.isAdmin)
    return {
      ok: false,
      status: 403,
      error: "Only exec board admins can take attendance.",
    };

  const { eventId, memberId } = input;
  if (
    !UUID.test(eventId) ||
    !UUID.test(memberId) ||
    typeof input.target !== "object"
  )
    return { ok: false, status: 400, error: "Bad request." };
  const target = {
    present: Boolean(input.target.present || input.target.demo),
    demo: Boolean(input.target.demo),
  };

  const [event, member] = await Promise.all([
    store.getEvent(eventId),
    store.getMember(memberId),
  ]);
  if (!event?.weekly)
    return { ok: false, status: 404, error: "That meeting doesn't exist." };
  if (!member)
    return { ok: false, status: 404, error: "That member doesn't exist." };
  if (member.excluded)
    return {
      ok: false,
      status: 409,
      error: "Exec board members aren't marked present.",
    };
  if (!member.active)
    return { ok: false, status: 409, error: "That member is inactive." };

  const row = await store.getRow(eventId, memberId);
  const by = viewer.memberId;

  if (target.present && !row.present)
    await store.markPresent(eventId, memberId, by);
  if (!target.demo && row.demoId) await store.revokeDemo(row.demoId, by);
  if (target.demo && !row.demoId)
    await store.awardDemo(
      eventId,
      memberId,
      by,
      BONUS.demoPoints,
      `Demoed at ${event.name} (${event.date})`,
    );
  if (!target.present && row.present)
    await store.unmarkPresent(eventId, memberId);

  return { ok: true, row: await store.getRow(eventId, memberId) };
}
