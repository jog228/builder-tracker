import Link from "next/link";
import { CheckinSheet, WeekSelect } from "@/components/admin/checkin-sheet";
import { Eyebrow } from "@/components/bs/site";
import {
  meetingDate,
  meetingLabel,
  meetingTimeLabel,
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
          {sheet.event.name} · {meetingLabel(sheet.event.date)} ·{" "}
          {meetingTimeLabel()}. Tap a builder to sign them in (
          {WEIGHTS.eventAttended.points} pts). 🎤 adds a demo (+
          {BONUS.demoPoints}) and signs them in too.
        </p>
      </div>

      <nav
        aria-label="Week"
        className="flex flex-wrap items-center gap-2 font-bold tracking-wider uppercase"
      >
        <WeekLink href={weeks[i + 1] && href(weeks[i + 1])} label="◀ Earlier" />
        <WeekSelect
          value={week}
          options={weeks.map((w, n) => ({
            value: w,
            href: href(w),
            label: `${n === 0 ? "This week · " : ""}${meetingLabel(meetingDate(w))}`,
          }))}
        />
        <WeekLink
          href={i > 0 ? href(weeks[i - 1]) : undefined}
          label="Later ▶"
        />
      </nav>
      {i > 0 && (
        <p className="border-rust text-rust border-2 px-3 py-2 font-semibold">
          Fixing a past week ({meetingLabel(sheet.event.date)}).{" "}
          <Link href="/admin/checkin" className="underline">
            Back to this week
          </Link>
        </p>
      )}

      <CheckinSheet
        key={sheet.event.id}
        eventId={sheet.event.id}
        members={sheet.members}
        recorders={sheet.recorders}
        hiddenExecs={sheet.hiddenExecs}
        demoPoints={BONUS.demoPoints}
      />
    </div>
  );
}

function WeekLink({ href, label }: { href?: string; label: string }) {
  const cls =
    "border-ink inline-flex min-h-11 items-center border-2 px-3 whitespace-nowrap";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-paper")}>
      {label}
    </Link>
  ) : (
    <span className={cn(cls, "opacity-35")} aria-disabled="true">
      {label}
    </span>
  );
}
