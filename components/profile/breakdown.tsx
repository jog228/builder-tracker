import { COMPONENT_LABELS, type Breakdown } from "@/lib/scoring/compute";

const ICONS: Record<keyof Breakdown, string> = {
  progress: "📈",
  shipped: "🚀",
  help: "🤝",
  likes: "❤️",
  events: "📅",
  githubDays: "💻",
  githubPrs: "🔀",
  streak: "🔥",
  bonus: "🎁",
};

const UNITS: Record<keyof Breakdown, string> = {
  progress: "update",
  shipped: "project",
  help: "time",
  likes: "like",
  events: "event",
  githubDays: "day",
  githubPrs: "PR",
  streak: "week",
  bonus: "award",
};

/** Why someone ranks where they do: every component, its count, points and cap. */
export function ScoreBreakdown({
  breakdown,
  monthly,
}: {
  breakdown: Breakdown;
  monthly: boolean;
}) {
  const keys = Object.keys(COMPONENT_LABELS) as (keyof Breakdown)[];
  return (
    <ul className="flex flex-col gap-3">
      {keys.map((k) => {
        const c = breakdown[k];
        const pct = c.cap
          ? Math.min(100, (c.points / c.cap) * 100)
          : c.points > 0
            ? 100
            : 0;
        return (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={c.points ? "" : "text-muted-foreground"}>
                {ICONS[k]} {COMPONENT_LABELS[k]}
                <span className="text-muted-foreground ml-2 text-xs">
                  {c.count} {UNITS[k]}
                  {c.count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="tabular font-semibold">
                {c.points}
                {monthly && c.cap !== null && (
                  <span className="text-muted-foreground text-xs font-normal">
                    {" "}
                    / {c.cap}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full ${c.cap && c.points >= c.cap ? "bg-emerald-400" : "to-primary bg-gradient-to-r from-violet-400"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {k === "bonus" && breakdown.bonus.lines.length > 0 && (
              <ul className="text-muted-foreground mt-2 flex flex-col gap-1 pl-6 text-xs">
                {breakdown.bonus.lines.map((l, i) => (
                  <li key={i}>
                    {l.label}{" "}
                    <span className="text-primary font-semibold">
                      +{l.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
