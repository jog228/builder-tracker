import { CalendarDays } from "lucide-react";
import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import {
  AttendanceChart,
  SimpleBars,
  WeeklyChart,
} from "@/components/stats/charts";
import { CountUp } from "@/components/bs/count-up";
import { Eyebrow, PageTitle } from "@/components/bs/site";
import { requireViewer } from "@/lib/auth";
import { getStats } from "@/lib/data/stats";

export const metadata = { title: "Stats · Builder Society" };

export default async function StatsPage() {
  await requireViewer();
  const s = await getStats();
  const tiles = [
    { label: "Updates logged this month", value: s.tiles.monthUpdates },
    {
      label: "Crew posting this month",
      value: s.tiles.monthBuilders,
      of: s.tiles.rankable,
    },
    { label: "Structures shipped", value: s.tiles.shipped },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow>Site statistics</Eyebrow>
        <PageTitle className="mt-3">The crew at a glance</PageTitle>
        <p className="text-slate mt-3 text-lg">
          Counts builders only; exec board activity isn&apos;t included.
        </p>
      </div>

      <section className="bg-ink text-paper grid grid-cols-1 gap-5 p-5 sm:grid-cols-3 sm:p-6">
        <h2 className="font-display text-safety text-2xl uppercase sm:col-span-3">
          Site board
        </h2>
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col">
            <span className="font-display text-5xl leading-tight">
              <CountUp value={t.value} />
              {t.of !== undefined && (
                <span className="text-steel text-3xl">/{t.of}</span>
              )}
            </span>
            <span className="tracking-[0.1em] uppercase">{t.label}</span>
          </div>
        ))}
      </section>

      <Card>
        <SectionTitle hint="last 10 weeks">Updates per week</SectionTitle>
        <WeeklyChart data={s.weekly} />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <SectionTitle>Most active days</SectionTitle>
          <SimpleBars data={s.byDay} x="day" color="var(--chart-2)" />
        </Card>
        <Card>
          <SectionTitle hint="Eastern time">Most active hours</SectionTitle>
          <SimpleBars data={s.byHour} x="label" color="var(--chart-3)" />
        </Card>
      </div>

      <Card>
        <SectionTitle>Attendance trend</SectionTitle>
        {s.attendance.length ? (
          <AttendanceChart data={s.attendance} />
        ) : (
          <EmptyState icon={CalendarDays}>
            Attendance shows up here once check-ins start (Phase 3).
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
