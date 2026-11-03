import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "@/lib/auth";
import {
  partitionLinks,
  type LinkRow,
  type TeammateLists,
  type TeammateMember,
} from "@/lib/teammates/rules";

const LINK_SELECT =
  "id, status, requester_id, recipient_id, email_status, project, requester:members!teammate_links_requester_id_fkey(id, display_name, avatar_url), recipient:members!teammate_links_recipient_id_fkey(id, display_name, avatar_url)";

/**
 * A profile's teammates. Everyone (guests too) sees confirmed ones; the
 * profile's owner also gets their incoming / outgoing requests and the roster
 * picker. Never selects emails. `db` is the reader's client (requireReader()).
 */
export async function getTeammates(
  memberId: string,
  db: SupabaseClient,
  viewer: Viewer | null,
): Promise<TeammateLists & { candidates: TeammateMember[] | null }> {
  const isOwner = viewer?.memberId === memberId;
  const links = db
    .from("teammate_links")
    .select(LINK_SELECT)
    .or(`requester_id.eq.${memberId},recipient_id.eq.${memberId}`);
  const [{ data, error }, candidates] = await Promise.all([
    isOwner
      ? links.in("status", ["confirmed", "pending"])
      : links.eq("status", "confirmed"),
    isOwner ? db.rpc("teammate_candidates") : null,
  ]);
  if (error) throw error;
  if (candidates?.error) throw candidates.error;
  return {
    ...partitionLinks((data ?? []) as LinkRow[], memberId),
    candidates: candidates
      ? (
          candidates.data as {
            id: string;
            display_name: string;
            avatar_url: string | null;
          }[]
        ).map((m) => ({
          id: m.id,
          name: m.display_name,
          avatarUrl: m.avatar_url,
        }))
      : null,
  };
}
