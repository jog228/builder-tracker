"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/bs/count-up";
import type { LeaderboardRow } from "@/lib/data/leaderboard";

/** The leader's name on a sign hanging from a crane hook. Swings in on load. */
export function CraneSign({
  leader,
  runnerUp,
  allTime,
}: {
  leader: LeaderboardRow;
  runnerUp: LeaderboardRow | undefined;
  allTime: boolean;
}) {
  const reduce = useReducedMotion();
  const gap = runnerUp ? leader.total - runnerUp.total : null;
  const weeks = leader.streak.current;

  return (
    <div className="flex w-full flex-col items-center">
      <div aria-hidden="true" className="crane-jib w-full" />
      <motion.div
        className="flex w-full origin-top flex-col items-center"
        initial={reduce ? false : { rotate: 7 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 40, damping: 4, delay: 0.2 }}
      >
        <div aria-hidden="true" className="bg-ink h-12 w-[3px] sm:h-[70px]" />
        <div
          aria-hidden="true"
          className="border-ink h-3.5 w-[22px] rounded-b-xl border-[3px] border-t-0"
        />
        <div className="bg-safety flex w-full -rotate-2 flex-col gap-2 border-4 border-[#111] p-5 text-[#111] shadow-[8px_8px_0_var(--ink)] sm:p-[22px]">
          <span className="text-sm font-bold tracking-[0.16em] uppercase">
            {allTime
              ? "All-time top builder"
              : "Leading for Builder of the Month"}
          </span>
          <Link
            href={`/builders/${leader.memberId}`}
            className="font-display text-[clamp(1.9rem,7vw,2.5rem)] leading-none uppercase hover:underline"
          >
            {leader.name}
          </Link>
          <span className="text-[1.05rem]">
            <CountUp value={leader.total} delay={0.2} /> pts
            {weeks > 0 && <> · {weeks}-week streak</>}
            {gap !== null && (
              <> · {gap > 0 ? `leads by ${gap}` : "tied for the lead"}</>
            )}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
