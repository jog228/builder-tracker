import { BadgeCheck, Clock, TrendingUp, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/bs/icon";
import { cn } from "@/lib/utils";

const TAPE = Array(6).fill("CAUTION · BUILDERS AT WORK").join(" · ");

/** The diagonal caution tape across the top of the page. */
export function CautionTape() {
  return (
    <div className="relative h-0" aria-hidden="true">
      <div className="caution-tape top-6 sm:top-9">{TAPE}</div>
    </div>
  );
}

const STAMP_TONES = {
  approved: "border-ok text-ok -rotate-4",
  pending: "border-rust text-rust rotate-3",
  neutral: "border-slate text-slate -rotate-2",
};

const STAMP_ICONS: Record<keyof typeof STAMP_TONES, LucideIcon> = {
  approved: BadgeCheck,
  pending: Clock,
  neutral: TrendingUp,
};

/** Rubber stamp, e.g. APPROVED / PENDING on a permit, with its icon. */
export function Stamp({
  tone,
  children,
  className,
}: {
  tone: keyof typeof STAMP_TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 border-[3px] px-2.5 py-0.5 text-sm font-bold tracking-[0.12em] uppercase",
        STAMP_TONES[tone],
        className,
      )}
    >
      <Icon icon={STAMP_ICONS[tone]} />
      {children}
    </span>
  );
}

/** Small caps-style label: "DAILY SITE REPORT · OCTOBER 2026". */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-rust text-sm font-bold tracking-[0.22em] uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Stencil page title, sized down for phones. */
export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-display text-[clamp(2.5rem,9vw,5.75rem)] leading-[0.95] uppercase",
        className,
      )}
    >
      {children}
    </h1>
  );
}
