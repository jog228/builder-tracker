"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** "Floors built" progress bar. Grows in step with the score count-up. */
export function FloorsBar({
  pct,
  lead,
  delay = 0,
  className,
}: {
  pct: number;
  /** Top three get safety yellow; everyone else steel. */
  lead: boolean;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "floors-track border-ink flex h-[22px] border-2 sm:h-[26px]",
        className,
      )}
    >
      <motion.span
        className={cn("floors-fill h-full", lead ? "bg-safety" : "bg-steel")}
        initial={reduce ? false : { width: 0 }}
        animate={{ width }}
        transition={{ delay, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}
