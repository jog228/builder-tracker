"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { MemberAvatar } from "@/components/bs/avatar";
import { Streak } from "@/components/bs/bits";
import type { LeaderboardRow } from "@/lib/data/leaderboard";
import { cn } from "@/lib/utils";

const PLACES = [
  { medal: "🥇", color: "var(--gold)", height: 168, avatar: 84, delay: 0.35 },
  { medal: "🥈", color: "var(--silver)", height: 124, avatar: 68, delay: 0.15 },
  { medal: "🥉", color: "var(--bronze)", height: 96, avatar: 64, delay: 0.55 },
];

/** Top three, animated: 2nd, 1st, 3rd from left to right. */
export function Podium({ top }: { top: LeaderboardRow[] }) {
  const reduce = useReducedMotion();
  const order = [1, 0, 2].filter((i) => top[i]);

  return (
    <div className="relative flex items-end justify-center gap-3 pt-10 sm:gap-6">
      {order.map((i) => {
        const row = top[i];
        const place = PLACES[i];
        return (
          <div
            key={row.memberId}
            className="flex w-28 flex-col items-center sm:w-40"
          >
            <motion.div
              initial={reduce ? false : { y: -40, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 16,
                delay: place.delay + 0.35,
              }}
              className="mb-3 flex flex-col items-center gap-1.5 text-center"
            >
              <Link
                href={`/builders/${row.memberId}`}
                className="group relative"
              >
                {i === 0 && (
                  <motion.span
                    className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl"
                    animate={
                      reduce
                        ? undefined
                        : { y: [0, -4, 0], rotate: [-6, 6, -6] }
                    }
                    transition={{
                      repeat: Infinity,
                      duration: 2.4,
                      ease: "easeInOut",
                    }}
                  >
                    👑
                  </motion.span>
                )}
                <span
                  className="block rounded-full p-[3px] transition-transform group-hover:scale-105"
                  style={{
                    background: `conic-gradient(from 200deg, ${place.color}, transparent 40%, ${place.color})`,
                  }}
                >
                  <MemberAvatar
                    name={row.name}
                    url={row.avatarUrl}
                    size={place.avatar}
                    className="ring-background ring-4"
                  />
                </span>
              </Link>
              <Link
                href={`/builders/${row.memberId}`}
                className="line-clamp-2 text-sm leading-tight font-semibold hover:underline"
              >
                {row.name}
              </Link>
              <div className="flex items-center gap-2">
                <span
                  className="tabular text-lg font-bold"
                  style={{ color: place.color }}
                >
                  {row.total}
                </span>
                <Streak weeks={row.streak.current} />
              </div>
            </motion.div>
            <motion.div
              initial={reduce ? false : { height: 0 }}
              animate={{ height: place.height }}
              transition={{
                type: "spring",
                stiffness: 120,
                damping: 18,
                delay: place.delay,
              }}
              className={cn(
                "relative w-full overflow-hidden rounded-t-2xl border border-b-0",
              )}
              style={{
                background: `linear-gradient(to bottom, color-mix(in oklch, ${place.color} 38%, transparent), color-mix(in oklch, ${place.color} 6%, transparent))`,
                borderColor: `color-mix(in oklch, ${place.color} 45%, transparent)`,
              }}
            >
              <span className="absolute inset-x-0 top-3 text-center text-3xl">
                {place.medal}
              </span>
              <span
                className="absolute inset-x-0 bottom-2 text-center text-5xl font-black opacity-25"
                style={{ color: place.color }}
              >
                {row.rank}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
