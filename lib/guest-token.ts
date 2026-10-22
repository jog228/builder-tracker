// Guest (portfolio spectator) access: a signed, expiring cookie value, and
// the password check. Server-side only: imported by middleware, server
// actions and server components, never by client code. Uses Web Crypto so
// it also runs in middleware. No "server-only" import: middleware isn't
// compiled with the react-server condition.

export const GUEST_COOKIE = "bs_guest";
/** About a week. */
export const GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

/** Reads PORTFOLIO_PASSWORD and SUPABASE_SECRET_KEY (server-only). */
type GuestEnv = Record<string, string | undefined>;

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string compare (equal length checked without early exit). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * The signing key, derived from the guest password and the server's secret
 * key: changing PORTFOLIO_PASSWORD signs every guest out. Null when guest
 * access isn't configured.
 */
async function signingKey(
  env: GuestEnv = process.env,
): Promise<CryptoKey | null> {
  const password = env.PORTFOLIO_PASSWORD;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!password || !secret) return null;
  const raw = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`guest-cookie|v1|${password}|${secret}`),
  );
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(key: CryptoKey, payload: string) {
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

/** A cookie value good for GUEST_TTL_SECONDS: "v1.<expires>.<signature>". */
export async function signGuestToken(
  now = Date.now(),
  env: GuestEnv = process.env,
): Promise<string | null> {
  const key = await signingKey(env);
  if (!key) return null;
  const expires = Math.floor(now / 1000) + GUEST_TTL_SECONDS;
  return `v1.${expires}.${await sign(key, `guest.v1.${expires}`)}`;
}

/** True for an unexpired token signed with the current password. */
export async function verifyGuestToken(
  token: string | undefined | null,
  now = Date.now(),
  env: GuestEnv = process.env,
): Promise<boolean> {
  const m = token?.match(/^v1\.(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/);
  if (!m) return false;
  if (Number(m[1]) * 1000 <= now) return false;
  const key = await signingKey(env);
  if (!key) return false;
  return safeEqual(await sign(key, `guest.v1.${m[1]}`), m[2]);
}

/** Compares a submitted password with PORTFOLIO_PASSWORD in constant time. */
export async function guestPasswordMatches(
  input: string,
  env: GuestEnv = process.env,
): Promise<boolean> {
  const expected = env.PORTFOLIO_PASSWORD;
  if (!expected || !input) return false;
  // Hash both so the comparison doesn't depend on the password's length.
  const [a, b] = await Promise.all(
    [input, expected].map((s) =>
      crypto.subtle.digest("SHA-256", enc.encode(s)),
    ),
  );
  return safeEqual(b64url(a), b64url(b));
}
