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
      <span className="text-slate text-xs font-bold tracking-wider uppercase">
        new
      </span>
    );
  }
  const delta = prevRank - rank;
  if (delta === 0) return <span className="text-slate font-bold">–</span>;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 font-bold",
        delta > 0 ? "text-ok" : "text-bad",
      )}
      title={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} since yesterday`}
    >
      {delta > 0 ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

/** Current weekly streak as "3 WK". Nothing when there's no streak. */
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
        "tabular font-semibold whitespace-nowrap uppercase",
        size === "lg" ? "text-lg" : "text-base",
      )}
      title={`${weeks}-week update streak`}
    >
      {weeks} wk
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
      className={cn("bg-paper border-ink border-[3px] p-4 sm:p-6", className)}
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-display text-2xl leading-none uppercase sm:text-[1.75rem]">
        {children}
      </h2>
      {hint && (
        <span className="text-slate text-sm font-semibold tracking-wider uppercase">
          {hint}
        </span>
      )}
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
    <div className="border-dash text-slate flex flex-col items-center gap-2 border-2 border-dashed px-4 py-8 text-center">
      <span className="text-2xl">{icon}</span>
      {children}
    </div>
  );
}

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  progress_update: {
    label: "Progress",
    className: "border-ink bg-steel/35",
  },
  shipped_candidate: {
    label: "Shipped?",
    className: "border-rust text-rust",
  },
  shipped: {
    label: "Shipped",
    className: "border-ok bg-ok text-paper",
  },
  help_given: {
    label: "Helped",
    className: "border-ink bg-safety",
  },
  event_related: { label: "Event", className: "border-ink" },
  chatter: { label: "Chatter", className: "border-dash text-slate" },
};

export function CategoryChip({ category }: { category: string }) {
  const s = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.chatter;
  return (
    <span
      className={cn(
        "border-2 px-1.5 py-px text-xs font-bold tracking-wider uppercase",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

/** Square toggle used for period switches and filters. */
export const toggleClass = (active: boolean, size: "md" | "sm" = "md") =>
  cn(
    "border-ink inline-flex items-center justify-center border-2 font-bold tracking-[0.08em] whitespace-nowrap uppercase transition-colors",
    size === "md" ? "min-h-12 px-5" : "min-h-9 px-3 text-sm",
    active ? "bg-safety text-[#111]" : "hover:bg-paper",
  );
