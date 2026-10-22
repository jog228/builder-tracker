// Where a member stands against the people around them in one period's
// ranking: the line under their profile total. Pure.

export type RankedEntry = {
  memberId: string;
  name: string;
  total: number;
};

export type Standing =
  | { kind: "leader"; leadBy: number }
  | { kind: "tied-first"; with: string[] }
  | { kind: "chasing"; toPass: number; name: string };

/**
 * For the leader: their lead over #2 (or who they're tied with). Otherwise:
 * points needed to pass the nearest builder ahead (gap + 1; tying isn't
 * passing). Null when the member isn't in the ranking (e.g. exec board).
 */
export function standing(
  entries: RankedEntry[],
  memberId: string,
): Standing | null {
  const me = entries.find((e) => e.memberId === memberId);
  if (!me) return null;
  const others = entries.filter((e) => e.memberId !== memberId);
  const ahead = others.filter((e) => e.total > me.total);
  if (!ahead.length) {
    const tied = others.filter((e) => e.total === me.total);
    if (tied.length)
      return { kind: "tied-first", with: tied.map((e) => e.name) };
    const next = Math.max(0, ...others.map((e) => e.total));
    return { kind: "leader", leadBy: me.total - next };
  }
  const nearest = ahead.reduce((a, b) => (b.total < a.total ? b : a));
  return {
    kind: "chasing",
    toPass: nearest.total - me.total + 1,
    name: nearest.name,
  };
}

const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

/** "12 pts to pass Michael Kim", "#1 — leading by 8 pts", "#1 — tied with …". */
export function standingText(s: Standing): string {
  if (s.kind === "chasing") return `${pts(s.toPass)} to pass ${s.name}`;
  if (s.kind === "leader") return `#1 — leading by ${pts(s.leadBy)}`;
  const [first, ...rest] = s.with;
  return rest.length
    ? `#1 — tied with ${first} and ${rest.length} other${rest.length === 1 ? "" : "s"}`
    : `#1 — tied with ${first}`;
}

/** Smallest visible width (percent) for any non-zero score's bar. */
export const MIN_BAR_PCT = 3;

/**
 * A leaderboard bar's fill, relative to #1: the leader is 100%, everyone else
 * their points ÷ the leader's points (at least MIN_BAR_PCT so low scores
 * still show). Zero points, or nobody with points yet, is an empty bar.
 */
export function barPercent(total: number, leaderTotal: number): number {
  if (leaderTotal <= 0 || total <= 0) return 0;
  return Math.min(100, Math.max(MIN_BAR_PCT, (total / leaderTotal) * 100));
}
