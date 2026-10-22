"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { MemberAvatar } from "@/components/bs/avatar";
import { RankChange, Streak, toggleClass } from "@/components/bs/bits";
import { CountUp } from "@/components/bs/count-up";
import { FloorsBar } from "@/components/bs/floors-bar";
import type { LeaderboardRow } from "@/lib/data/leaderboard";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "streak" | "shipped" | "scored";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "scored", label: "Has points" },
  { key: "streak", label: "On a streak" },
  { key: "shipped", label: "Shipped" },
];

// Phone: rank | builder + bar | pts. From sm: the full schedule columns.
const GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[3rem_minmax(0,15rem)_minmax(0,1fr)_4.5rem_3.5rem_4rem] sm:gap-x-3.5";

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
  // A little headroom so the leader's bar isn't a solid block.
  const max = Math.max(1, ...rows.map((r) => r.total)) * 1.06;

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
    <section className="bg-paper border-ink flex flex-col gap-4 border-[3px] p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[1.75rem] leading-none uppercase sm:text-[2rem]">
          Progress schedule
        </h2>
        <label className="flex w-full flex-col gap-1 text-sm font-bold tracking-widest uppercase sm:w-64">
          Find a builder
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name"
            className="border-ink text-ink placeholder:text-slate min-h-11 w-full border-2 bg-white px-3 text-lg font-normal tracking-normal normal-case"
          />
        </label>
      </div>

      <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={toggleClass(filter === f.key, "sm")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        aria-hidden="true"
        className={cn(
          GRID,
          "border-ink border-b-[3px] py-2 text-[0.8rem] font-bold tracking-widest uppercase",
        )}
      >
        <span>No.</span>
        <span className="col-span-1">Builder</span>
        <span className="hidden sm:block">Floors built</span>
        <span className="hidden sm:block">Streak</span>
        <span className="hidden sm:block">Δ</span>
        <span className="text-right">Pts</span>
      </div>

      <ol className="-mt-4 flex flex-col">
        <AnimatePresence initial={!reduce}>
          {visible.map((r, i) => {
            const me = r.memberId === viewerId;
            const delay = Math.min(i, 15) * 0.04;
            const pct = (r.total / max) * 100;
            const shipped = r.breakdown.shipped.count;
            return (
              <motion.li
                key={r.memberId}
                layout={!reduce}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay }}
                className="border-rule border-b"
              >
                <Link
                  href={`/builders/${r.memberId}`}
                  className={cn(
                    GRID,
                    "group items-center py-3 transition-colors",
                    me ? "bg-safety/25" : "hover:bg-concrete/60",
                  )}
                >
                  <span className="font-display text-[1.35rem] sm:pl-1">
                    {r.rank}
                  </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MemberAvatar
                      name={r.name}
                      url={r.avatarUrl}
                      size={34}
                      className="hidden sm:inline-flex"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[1.15rem] leading-tight font-bold group-hover:underline">
                          {r.name}
                        </span>
                        {me && (
                          <span className="bg-ink text-safety px-1.5 text-xs font-bold tracking-wider">
                            YOU
                          </span>
                        )}
                      </span>
                      <span className="text-slate flex min-w-0 items-center gap-2 text-[0.95rem]">
                        <span className="truncate">
                          {plural(r.breakdown.progress.count, "update")}
                          {shipped > 0 && <> · {shipped} shipped</>}
                        </span>
                        {r.badges.length > 0 && (
                          <span className="flex shrink-0 gap-0.5">
                            {r.badges.map((b) => (
                              <span
                                key={b.slug}
                                title={`${b.name}: ${b.description}`}
                              >
                                {b.icon}
                              </span>
                            ))}
                          </span>
                        )}
                        {/* Phone: streak and movement fold into this line. */}
                        <span className="text-ink flex shrink-0 items-center gap-2 sm:hidden">
                          <Streak weeks={r.streak.current} />
                          <RankChange rank={r.rank} prevRank={r.prevRank} />
                        </span>
                      </span>
                      <FloorsBar
                        pct={pct}
                        lead={r.rank <= 3}
                        delay={delay}
                        className="mt-1.5 sm:hidden"
                      />
                    </span>
                  </span>
                  <FloorsBar
                    pct={pct}
                    lead={r.rank <= 3}
                    delay={delay}
                    className="hidden sm:flex"
                  />
                  <span className="hidden sm:block">
                    {r.streak.current > 0 ? (
                      <Streak weeks={r.streak.current} />
                    ) : (
                      <span className="text-slate">–</span>
                    )}
                  </span>
                  <span className="hidden sm:block">
                    <RankChange rank={r.rank} prevRank={r.prevRank} />
                  </span>
                  <span className="font-display self-start pt-0.5 text-right text-2xl sm:self-center sm:pt-0">
                    <CountUp value={r.total} delay={delay} />
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {!visible.length && (
        <p className="text-slate py-10 text-center text-lg">
          No builders match that filter.
        </p>
      )}
    </section>
  );
}
