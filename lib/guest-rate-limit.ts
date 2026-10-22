// Rate limit for the guest password: per IP and overall, over a sliding
// window, counting failed attempts only. The decision is pure; the store
// (guest_login_attempts, service role) is passed in.
export const GUEST_RATE_LIMIT = {
  windowMinutes: 15,
  /** Failed attempts allowed per IP per window. */
  perIp: 5,
  /** Failed attempts allowed from everyone per window (slows spraying). */
  global: 30,
} as const;

export function rateLimited(failures: { ip: number; global: number }): boolean {
  return (
    failures.ip >= GUEST_RATE_LIMIT.perIp ||
    failures.global >= GUEST_RATE_LIMIT.global
  );
}

/** Salted SHA-256 of the client IP, so no raw IPs are stored. */
export async function ipKey(ip: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`guest-ip|${salt}|${ip}`),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(h: { get(name: string): string | null }): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
