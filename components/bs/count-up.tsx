"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A number that counts up from 0 on load. The server renders the final value,
 * screen readers only ever get the final value, and reduced motion skips it.
 */
export function CountUp({
  value,
  delay = 0,
  duration = 1.1,
  className,
}: {
  value: number;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    el.textContent = "0";
    const controls = animate(0, value, {
      delay,
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = String(Math.round(v))),
    });
    return () => controls.stop();
  }, [value, delay, duration, reduce]);

  return (
    <span className={cn("tabular", className)}>
      <span className="sr-only">{value}</span>
      <span ref={ref} aria-hidden="true">
        {value}
      </span>
    </span>
  );
}
