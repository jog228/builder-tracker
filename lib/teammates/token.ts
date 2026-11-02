// Email confirm/decline tokens: 32 random bytes (256 bits) as base64url. Only
// the sha256 is stored (teammate_tokens), so a database leak can't be used to
// answer someone's request. Single-use and expiring (enforced by the RPCs).
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_TTL_DAYS = 14;

/** A new token for an email link. */
export const newToken = () => randomBytes(32).toString("base64url");

/** What the database stores and looks tokens up by. */
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Shape check before touching the database (32 bytes → 43 base64url chars). */
export const isTokenShape = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export const tokenExpiry = (now = new Date()) =>
  new Date(now.getTime() + TOKEN_TTL_DAYS * 86_400_000);
