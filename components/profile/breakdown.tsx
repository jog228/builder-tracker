import {
  CalendarCheck,
  Code,
  Flame,
  Gift,
  GitMerge,
  HandHeart,
  Handshake,
  Heart,
  MonitorPlay,
  Rocket,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/bs/icon";
import type { AttendanceRate } from "@/lib/attendance/meetings";
import { dayLabel } from "@/lib/format";
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
  attendance,
}: {
  breakdown: Breakdown;
  monthly: boolean;
  /** Meetings attended ÷ held in this period; the Events row shows it as a rate. */
  attendance: AttendanceRate;
}) {
  const keys = Object.keys(COMPONENT_LABELS) as (keyof Breakdown)[];
  return (
    <ul className="flex flex-col gap-3.5">
      {keys.map((k) => {
        const c = breakdown[k];
        // Events: an attendance-rate bar. Points are unchanged (per meeting).
        const rate = k === "events" ? attendance : null;
        const pct = rate
          ? (rate.pct ?? 0)
          : c.cap
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
                  {rate ? (
                    rate.held ? (
                      <>
                        · {rate.attended} of {rate.held} meeting
                        {rate.held === 1 ? "" : "s"}
                      </>
                    ) : (
                      "· No meetings yet"
                    )
                  ) : (
                    <>
                      {c.count} {UNITS[k]}
                      {c.count === 1 ? "" : "s"}
                    </>
                  )}
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
            <div className="mt-1 flex items-center gap-2">
              <div
                className="border-ink bg-concrete h-3 flex-1 overflow-hidden border-2"
                {...(rate && {
                  role: "meter",
                  "aria-label": "Attendance rate",
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": rate.pct ?? 0,
                  "aria-valuetext": rate.held
                    ? `${rate.pct}%, ${rate.attended} of ${rate.held} meetings`
                    : "No meetings yet",
                })}
              >
                <div
                  className={`floors-fill h-full ${!rate && c.cap && c.points >= c.cap ? "bg-ok" : "bg-safety"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {rate && rate.pct !== null && (
                <span className="tabular w-10 text-right text-sm font-bold">
                  {rate.pct}%
                </span>
              )}
            </div>
            {k === "bonus" && breakdown.bonus.lines.length > 0 && (
              <ul className="text-slate mt-2 flex flex-col gap-1 pl-6 text-sm">
                {breakdown.bonus.lines.map((l, i) => (
                  <li key={i}>
                    <Icon
                      icon={
                        l.type === "demo"
                          ? MonitorPlay
                          : l.type === "community"
                            ? HandHeart
                            : Gift
                      }
                      className="mr-1"
                    />
                    {/* "Instagram feature +5 · Oct 22 · by Jolie". Snapshots from
                        before lines carried a date fall back to awardedAt. */}
                    {l.label}{" "}
                    <span className="text-ink font-bold">+{l.points}</span>
                    {" · "}
                    {dayLabel(l.date ?? l.awardedAt)}
                    {l.type !== "demo" && l.by && (
                      <> · by {l.by.split(" ")[0]}</>
                    )}
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
