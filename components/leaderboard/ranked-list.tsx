"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { MemberAvatar } from "@/components/bs/avatar";
import { RankChange, Streak } from "@/components/bs/bits";
import type { LeaderboardRow } from "@/lib/data/leaderboard";
import { cn } from "@/lib/utils";

type Filter = "all" | "streak" | "shipped" | "scored";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "scored", label: "Has points" },
  { key: "streak", label: "🔥 On a streak" },
  { key: "shipped", label: "🚀 Shipped" },
];

export function RankedList({
  rows,
  viewerId,
}: {
  rows: LeaderboardRow[];
  viewerId: string;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const max = Math.max(1, ...rows.map((r) => r.total));

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (query && !r.name.toLowerCase().includes(query.toLowerCase()))
          return false;
        if (filter === "streak") return r.streak.current >= 2;
        if (filter === "shipped") return r.breakdown.shipped.count > 0;
        if (filter === "scored") return r.total > 0;
        return true;
      }),
    [rows, query, filter],
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search builders…"
          className="placeholder:text-muted-foreground/70 focus:border-primary/60 h-9 w-full rounded-full border bg-white/5 px-4 text-sm outline-none sm:w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="flex flex-col gap-1.5">
        <AnimatePresence initial={!reduce}>
          {visible.map((r, i) => {
            const me = r.memberId === viewerId;
            return (
              <motion.li
                key={r.memberId}
                layout={!reduce}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: Math.min(i, 15) * 0.025 }}
              >
                <Link
                  href={`/builders/${r.memberId}`}
                  className={cn(
                    "group grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors sm:grid-cols-[2.5rem_2.5rem_1fr_auto]",
                    me
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent bg-white/[0.03] hover:bg-white/[0.07]",
                  )}
                >
                  <span className="tabular text-muted-foreground text-center text-lg font-bold">
                    {r.rank}
                  </span>
                  <span className="hidden justify-center sm:flex">
                    <RankChange rank={r.rank} prevRank={r.prevRank} />
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <MemberAvatar name={r.name} url={r.avatarUrl} size={36} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium group-hover:underline">
                          {r.name}
                        </span>
                        {me && (
                          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] font-bold">
                            YOU
                          </span>
                        )}
                        <Streak weeks={r.streak.current} />
                        <span className="hidden gap-0.5 sm:flex">
                          {r.badges.map((b) => (
                            <span
                              key={b.slug}
                              title={`${b.name}: ${b.description}`}
                            >
                              {b.icon}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-white/5">
                        <span
                          className="to-primary block h-full rounded-full bg-gradient-to-r from-violet-400"
                          style={{ width: `${(r.total / max) * 100}%` }}
                        />
                      </span>
                    </span>
                  </span>
                  <span className="tabular text-right text-lg font-bold">
                    {r.total}
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      pts
                    </span>
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {!visible.length && (
        <p className="text-muted-foreground py-10 text-center text-sm">
          No builders match that filter.
        </p>
      )}
    </div>
  );
}
