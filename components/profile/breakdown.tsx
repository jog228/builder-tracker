import {
  CalendarCheck,
  Code,
  Flame,
  Gift,
  GitMerge,
  Handshake,
  Heart,
  MonitorPlay,
  Rocket,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/bs/icon";
import { COMPONENT_LABELS, type Breakdown } from "@/lib/scoring/compute";

const ICONS: Record<keyof Breakdown, LucideIcon> = {
  progress: TrendingUp,
  shipped: Rocket,
  help: Handshake,
  likes: Heart,
  events: CalendarCheck,
  githubDays: Code,
  githubPrs: GitMerge,
  streak: Flame,
  bonus: Gift,
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
    <ul className="flex flex-col gap-3.5">
      {keys.map((k) => {
        const c = breakdown[k];
        const pct = c.cap
          ? Math.min(100, (c.points / c.cap) * 100)
          : c.points > 0
            ? 100
            : 0;
        return (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={c.points ? "font-semibold" : "text-slate"}>
                <Icon
                  icon={ICONS[k]}
                  tone={c.points ? "accent" : "ink"}
                  className="mr-1.5"
                />
                {COMPONENT_LABELS[k]}
                <span className="text-slate ml-2 text-sm font-normal">
                  {c.count} {UNITS[k]}
                  {c.count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="tabular font-bold">
                {c.points}
                {monthly && c.cap !== null && (
                  <span className="text-slate text-sm font-normal">
                    {" "}
                    / {c.cap}
                  </span>
                )}
              </span>
            </div>
            <div className="border-ink bg-concrete mt-1 h-3 overflow-hidden border-2">
              <div
                className={`floors-fill h-full ${c.cap && c.points >= c.cap ? "bg-ok" : "bg-safety"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {k === "bonus" && breakdown.bonus.lines.length > 0 && (
              <ul className="text-slate mt-2 flex flex-col gap-1 pl-6 text-sm">
                {breakdown.bonus.lines.map((l, i) => (
                  <li key={i}>
                    <Icon
                      icon={l.type === "demo" ? MonitorPlay : Gift}
                      className="mr-1"
                    />
                    {l.label}{" "}
                    <span className="text-ink font-bold">+{l.points}</span>
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
