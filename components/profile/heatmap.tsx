import { localDate, weekKey } from "@/lib/scoring/time";
import { plural, shortDate } from "@/lib/format";

const DAY = 86_400_000;
const LEVELS = [
  "bg-white/[0.05]",
  "bg-orange-500/30",
  "bg-orange-500/55",
  "bg-orange-400/80",
  "bg-amber-300",
];

/** GitHub-style grid of messages per day (club time), Monday at the top. */
export function ActivityHeatmap({
  timestamps,
  weeks,
}: {
  timestamps: string[];
  weeks: number;
}) {
  const perDay = new Map<string, number>();
  for (const t of timestamps) {
    const d = localDate(t);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const lastMonday = Date.parse(`${weekKey(new Date())}T12:00:00Z`);
  const today = localDate(new Date());
  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(lastMonday - (weeks - 1 - w) * 7 * DAY + d * DAY)
        .toISOString()
        .slice(0, 10);
      return { date, count: perDay.get(date) ?? 0, future: date > today };
    }),
  );
  const level = (n: number) =>
    n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((c) => (
              <span
                key={c.date}
                title={
                  c.future
                    ? undefined
                    : `${plural(c.count, "message")} on ${shortDate(`${c.date}T12:00:00Z`)}`
                }
                className={`size-3.5 rounded-[4px] ${c.future ? "opacity-0" : LEVELS[level(c.count)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
        Less{" "}
        {LEVELS.map((l) => (
          <span key={l} className={`size-2.5 rounded-[3px] ${l}`} />
        ))}{" "}
        More
      </div>
    </div>
  );
}
