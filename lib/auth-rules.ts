// Who may sign in, and how. Pure so it can be unit tested; lib/auth.ts and the
// /auth/* routes apply it.
//
// - Members sign in with Google, using a Google Workspace account on
//   lehigh.edu whose email is on the roster (members.email).
// - Email magic links are a backup for admins only (and any member in local dev,
//   so `npm run login-link` can test a regular account).

export const ALLOWED_DOMAIN = "lehigh.edu";

export type LoginMethod = "google" | "email" | "other";

export type Denial =
  | "domain" // Google account outside lehigh.edu
  | "not-member" // lehigh.edu account that isn't on the roster
  | "admins-only" // magic link used by a non-admin
  | "linked-elsewhere"; // roster row already linked to a different login

/** Exactly @lehigh.edu (not a subdomain or a lookalike). */
export function isAllowedDomain(email: string | null | undefined): boolean {
  const at = email?.trim().toLowerCase().split("@");
  return at?.length === 2 && at[0].length > 0 && at[1] === ALLOWED_DOMAIN;
}

type AmrEntry = { method: string; timestamp?: number } | string;

/**
 * How this session was created, from the JWT `amr` claim. The newest entry
 * wins (a later magic link on a Google account counts as email).
 */
export function loginMethod(amr: AmrEntry[] | null | undefined): LoginMethod {
  if (!amr?.length) return "other";
  const entries = amr.map((e, i) =>
    typeof e === "string" ? { method: e, timestamp: i } : e,
  );
  const latest = entries.reduce((a, b) =>
    (b.timestamp ?? 0) >= (a.timestamp ?? 0) ? b : a,
  );
  if (latest.method === "oauth") return "google";
  if (latest.method === "otp" || latest.method === "magiclink") return "email";
  return "other";
}

/**
 * Google's `hd` (hosted domain) claim, which only Workspace accounts have.
 * It stops a personal Google account that merely uses a lehigh.edu address.
 */
export function hostedDomain(userMetadata: unknown): string | null {
  const m = userMetadata as { custom_claims?: { hd?: unknown } } | null;
  const hd = m?.custom_claims?.hd;
  return typeof hd === "string" ? hd.toLowerCase() : null;
}

/** The decision for a session, given the member row its email maps to. */
export function admission({
  method,
  email,
  hd,
  member,
  dev = false,
}: {
  method: LoginMethod;
  email: string | null | undefined;
  /** Pass `hostedDomain(...)` for Google sign-ins; ignored otherwise. */
  hd?: string | null;
  member: { isAdmin: boolean } | null;
  dev?: boolean;
}): { ok: true } | { ok: false; reason: Denial } {
  if (method === "google") {
    if (!isAllowedDomain(email) || hd !== ALLOWED_DOMAIN)
      return { ok: false, reason: "domain" };
    if (!member) return { ok: false, reason: "not-member" };
    return { ok: true };
  }
  if (method === "email") {
    if (!member) return { ok: false, reason: "not-member" };
    if (!member.isAdmin && !dev) return { ok: false, reason: "admins-only" };
    return { ok: true };
  }
  return { ok: false, reason: "not-member" };
}
