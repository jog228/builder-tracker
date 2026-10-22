// The guest (portfolio) password flow: rate limit, constant-time check,
// record the attempt, and mint the cookie value. The attempt store is passed
// in, so this is testable without a database.
import { guestPasswordMatches, signGuestToken } from "./guest-token";
import { GUEST_RATE_LIMIT, ipKey, rateLimited } from "./guest-rate-limit";

export interface GuestAttemptStore {
  /** Failed attempts since `since`, for this key and for everyone. */
  failures(
    keyHash: string,
    since: Date,
  ): Promise<{ ip: number; global: number }>;
  record(keyHash: string, ok: boolean): Promise<void>;
}

export type GuestLoginResult =
  { ok: true; token: string } | { ok: false; error: string };

type Env = Record<string, string | undefined>;

export async function attemptGuestLogin(
  password: string,
  ip: string,
  store: GuestAttemptStore,
  { env = process.env, now = Date.now() }: { env?: Env; now?: number } = {},
): Promise<GuestLoginResult> {
  if (!env.PORTFOLIO_PASSWORD || !env.SUPABASE_SECRET_KEY)
    return { ok: false, error: "Guest access isn't set up." };

  const key = await ipKey(ip, env.SUPABASE_SECRET_KEY);
  const since = new Date(now - GUEST_RATE_LIMIT.windowMinutes * 60_000);
  if (rateLimited(await store.failures(key, since)))
    return {
      ok: false,
      error: `Too many tries. Wait ${GUEST_RATE_LIMIT.windowMinutes} minutes and try again.`,
    };

  const ok = await guestPasswordMatches(password, env);
  await store.record(key, ok);
  if (!ok) return { ok: false, error: "That password isn't right." };
  const token = await signGuestToken(now, env);
  return token
    ? { ok: true, token }
    : { ok: false, error: "Guest access isn't set up." };
}
