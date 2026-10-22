import { cn } from "@/lib/utils";

/** ▲ / ▼ movement since the previous day's ranking. */
export function RankChange({
  rank,
  prevRank,
}: {
  rank: number;
  prevRank: number | null;
}) {
  if (prevRank === null) {
    return (
      <span className="text-muted-foreground/60 text-xs font-medium">new</span>
    );
  }
  const delta = prevRank - rank;
  if (delta === 0)
    return <span className="text-muted-foreground/60 text-xs">–</span>;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 text-xs font-semibold",
        delta > 0 ? "text-emerald-400" : "text-rose-400",
      )}
      title={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} since ${delta > 0 ? "yesterday" : "yesterday"}`}
    >
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

/** 🔥 with the current weekly streak. Nothing when there's no streak. */
export function Streak({
  weeks,
  size = "sm",
}: {
  weeks: number;
  size?: "sm" | "lg";
}) {
  if (weeks < 1) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold text-orange-300",
        size === "lg" ? "text-lg" : "text-sm",
      )}
      title={`${weeks}-week update streak`}
    >
      <span className={weeks >= 2 ? "animate-flicker" : undefined}>🔥</span>
      <span className="tabular">{weeks}</span>
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "bg-card/80 rounded-2xl border p-5 shadow-xl shadow-black/20 backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {children}
      </h2>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center text-sm">
      <span className="text-2xl">{icon}</span>
      {children}
    </div>
  );
}

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  progress_update: {
    label: "Progress",
    className: "bg-sky-400/15 text-sky-300",
  },
  shipped_candidate: {
    label: "Shipped?",
    className: "bg-amber-400/15 text-amber-300",
  },
  shipped: {
    label: "🚀 Shipped",
    className: "bg-emerald-400/15 text-emerald-300",
  },
  help_given: {
    label: "Helped",
    className: "bg-violet-400/15 text-violet-300",
  },
  event_related: { label: "Event", className: "bg-zinc-400/15 text-zinc-300" },
  chatter: { label: "Chatter", className: "bg-zinc-400/10 text-zinc-400" },
};

export function CategoryChip({ category }: { category: string }) {
  const s = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.chatter;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}
