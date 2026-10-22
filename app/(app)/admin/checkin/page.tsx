import { ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { CheckinSheet, WeekSelect } from "@/components/admin/checkin-sheet";
import { NewMeeting } from "@/components/admin/new-meeting";
import { Icon } from "@/components/bs/icon";
import { Eyebrow } from "@/components/bs/site";
import {
  MAX_DAYS_AHEAD,
  meetingOptions,
  nextMeetingDate,
  optionLabel,
  resolveMeetingDate,
  timeLabel,
} from "@/lib/attendance/meeting-days";
import {
  isKickoff,
  meetingDate,
  meetingLabel,
  meetingTitle,
  seasonFirstWeek,
} from "@/lib/attendance/weeks";
import { requireAdmin } from "@/lib/auth";
import { getCheckinSheet, listMeetings } from "@/lib/data/checkin";
import { BONUS, WEEKLY_MEETING, WEIGHTS } from "@/lib/scoring/config";
import { localDate } from "@/lib/scoring/time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Crew sign-in · Builder Society" };

const DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; week?: string }>;
}) {
  // Non-admins are sent to the leaderboard.
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const now = new Date();
  const today = localDate(now);

  const meetings = await listMeetings(supabase);
  const latest = meetings[0] ?? null;
  // Newest first: season weeks' usual days up to now, plus every meeting
  // (future ones included, so "Later" reaches them).
  const options = meetingOptions(
    meetings.map((m) => m.date),
    now,
  );
  const date = resolveMeetingDate(await searchParams, options, now);
  const i = options.findIndex((o) => o.date === date);
  const selected = options[i];
  const sheet = await getCheckinSheet(supabase, date, viewer.memberId, latest);
  const href = (d: string) =>
    options.find((o) => o.date === d)?.current
      ? "/admin/checkin"
      : `/admin/checkin?date=${d}`;
  const upcoming = sheet.event.date > today;

  return (
    <div className="flex flex-col gap-5">
      {/* Title block on the left, "+ New meeting" on the right (below on phones). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Eyebrow>Exec board · attendance</Eyebrow>
          <h1 className="font-display mt-2 text-[clamp(2.25rem,9vw,4.5rem)] leading-[0.95] uppercase">
            Crew sign-in
          </h1>
          <p className="text-slate mt-2 text-lg leading-snug">
            {isKickoff(sheet.event.date) ? "" : `${sheet.event.name} · `}
            {meetingTitle(sheet.event.date)} ·{" "}
            {timeLabel(sheet.event.start_time ?? WEEKLY_MEETING.time)}. Tap a
            builder to sign them in (
            {WEIGHTS.eventAttended.points * Number(sheet.event.weight)} pts).{" "}
            <Icon icon={MonitorPlay} tone="accent" /> Demo adds +
            {BONUS.demoPoints} and signs them in too.
          </p>
        </div>
        <NewMeeting
          defaultDate={nextMeetingDate(latest?.date ?? null, now)}
          defaultTime={(latest?.start_time ?? WEEKLY_MEETING.time).slice(0, 5)}
          title={latest?.name ?? WEEKLY_MEETING.name}
          signInPoints={
            WEIGHTS.eventAttended.points * Number(latest?.weight ?? 1)
          }
          demoPoints={BONUS.demoPoints}
          minDate={meetingDate(seasonFirstWeek())}
          maxDate={addDays(today, MAX_DAYS_AHEAD)}
        />
      </div>

      <nav
        aria-label="Meeting"
        // Phone: the picker gets its own row, Earlier / Later share the next.
        className="grid grid-cols-2 gap-2 font-bold tracking-wider uppercase sm:flex sm:items-center"
      >
        <WeekLink
          href={options[i + 1] && href(options[i + 1].date)}
          label="Earlier"
          icon="prev"
          disabledHint="No earlier meetings this season"
        />
        <WeekSelect
          className="col-span-2 row-start-1 sm:flex-1"
          value={date}
          options={options.map((o) => ({
            value: o.date,
            href: href(o.date),
            label: optionLabel(o),
          }))}
        />
        <WeekLink
          href={i > 0 ? href(options[i - 1].date) : undefined}
          label="Later"
          icon="next"
          disabledHint="No later meetings yet"
        />
      </nav>
      {!selected?.current && !upcoming && (
        <p className="border-rust text-rust border-2 px-3 py-2 font-semibold">
          Fixing a past meeting ({meetingTitle(sheet.event.date)}).{" "}
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
        opensOn={upcoming ? meetingLabel(sheet.event.date) : null}
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
