import { ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { CheckinSheet, WeekSelect } from "@/components/admin/checkin-sheet";
import { Icon } from "@/components/bs/icon";
import { Eyebrow } from "@/components/bs/site";
import {
  meetingDate,
  isKickoff,
  meetingTimeLabel,
  meetingTitle,
  pickerWeeks,
  resolveWeek,
} from "@/lib/attendance/weeks";
import { requireAdmin } from "@/lib/auth";
import { getCheckinSheet } from "@/lib/data/checkin";
import { BONUS, WEIGHTS } from "@/lib/scoring/config";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Crew sign-in · Builder Society" };

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  // Non-admins are sent to the leaderboard.
  const viewer = await requireAdmin();
  const weeks = pickerWeeks();
  const week = resolveWeek((await searchParams).week);
  const i = weeks.indexOf(week);
  const sheet = await getCheckinSheet(
    await createClient(),
    week,
    viewer.memberId,
  );
  const href = (w: string) =>
    w === weeks[0] ? "/admin/checkin" : `/admin/checkin?week=${w}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Exec board · attendance</Eyebrow>
        <h1 className="font-display mt-2 text-[clamp(2.25rem,9vw,4.5rem)] leading-[0.95] uppercase">
          Crew sign-in
        </h1>
        <p className="text-slate mt-2 text-lg leading-snug">
          {isKickoff(sheet.event.date) ? "" : `${sheet.event.name} · `}
          {meetingTitle(sheet.event.date)} · {meetingTimeLabel()}. Tap a builder
          to sign them in ({WEIGHTS.eventAttended.points} pts).{" "}
          <Icon icon={MonitorPlay} tone="accent" /> Demo adds +
          {BONUS.demoPoints} and signs them in too.
        </p>
      </div>

      <nav
        aria-label="Week"
        // Phone: the picker gets its own row, Earlier / Later share the next.
        className="grid grid-cols-2 gap-2 font-bold tracking-wider uppercase sm:flex sm:items-center"
      >
        <WeekLink
          href={weeks[i + 1] && href(weeks[i + 1])}
          label="Earlier"
          icon="prev"
          disabledHint="No earlier meetings this season"
        />
        <WeekSelect
          className="col-span-2 row-start-1 sm:flex-1"
          value={week}
          options={weeks.map((w, n) => ({
            value: w,
            href: href(w),
            label: `${n === 0 ? "This week · " : ""}${meetingTitle(meetingDate(w))}`,
          }))}
        />
        <WeekLink
          href={i > 0 ? href(weeks[i - 1]) : undefined}
          label="Later"
          icon="next"
          disabledHint="No later meetings yet"
        />
      </nav>
      {i > 0 && (
        <p className="border-rust text-rust border-2 px-3 py-2 font-semibold">
          Fixing a past week ({meetingTitle(sheet.event.date)}).{" "}
          <Link href="/admin/checkin" className="underline">
            Back to this week
          </Link>
        </p>
      )}

      <CheckinSheet
        key={sheet.event.id}
        eventId={sheet.event.id}
        eventDate={sheet.event.date}
        members={sheet.members}
        recorders={sheet.recorders}
        hiddenExecs={sheet.hiddenExecs}
        demoPoints={BONUS.demoPoints}
      />
    </div>
  );
}

function WeekLink({
  href,
  label,
  icon,
  disabledHint,
}: {
  href?: string;
  label: string;
  icon: "prev" | "next";
  /** Tooltip (title, also its accessible description) when there's nowhere to go. */
  disabledHint: string;
}) {
  const cls =
    "inline-flex min-h-11 items-center justify-center gap-1 border-2 px-3 whitespace-nowrap";
  const body =
    icon === "prev" ? (
      <>
        <Icon icon={ChevronLeft} /> {label}
      </>
    ) : (
      <>
        {label} <Icon icon={ChevronRight} />
      </>
    );
  return href ? (
    <Link href={href} className={cn(cls, "border-ink hover:bg-paper")}>
      {body}
    </Link>
  ) : (
    // Same shape, clearly off: dashed muted border, muted text, no pointer.
    <span
      role="link"
      aria-disabled="true"
      title={disabledHint}
      className={cn(
        cls,
        "border-dash text-slate/55 bg-concrete cursor-not-allowed border-dashed select-none",
      )}
    >
      {body}
    </span>
  );
}
