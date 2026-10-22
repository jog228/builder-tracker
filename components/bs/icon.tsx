import {
  Award,
  CalendarCheck,
  Flame,
  Handshake,
  Heart,
  MonitorPlay,
  Moon,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A Lucide icon styled for G2: sized to the surrounding text, a heavier
 * stroke, and the text color (navy ink) by default. "accent" fills it safety
 * yellow with the ink outline, like a caution sign, so it stays visible on
 * light backgrounds. Decorative unless given a `label`.
 */
export function Icon({
  icon: Glyph,
  tone = "ink",
  label,
  className,
}: {
  icon: LucideIcon;
  tone?: "ink" | "accent";
  /** Accessible name; omit when the icon sits next to text saying the same. */
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      strokeWidth={2.25}
      fill={tone === "accent" ? "var(--safety)" : "none"}
      className={cn(
        "inline-block size-[1em] shrink-0 align-[-0.125em]",
        tone === "accent" && "text-ink",
        className,
      )}
    />
  );
}

/**
 * Badge icons by slug. The `badges.icon` column still holds the original
 * emoji seeds; the UI ignores it and uses these. New badges fall back to Award.
 */
const BADGE_ICONS: Record<string, LucideIcon> = {
  shipper: Rocket,
  "never-misses": CalendarCheck,
  "on-fire": Flame,
  "night-owl": Moon,
  "crowd-favorite": Heart,
  helper: Handshake,
  "demo-day": MonitorPlay,
};

export const badgeIcon = (slug: string): LucideIcon =>
  BADGE_ICONS[slug] ?? Award;
