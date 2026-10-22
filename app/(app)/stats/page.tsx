import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import {
  AttendanceChart,
  SimpleBars,
  WeeklyChart,
} from "@/components/stats/charts";
import { requireViewer } from "@/lib/auth";
import { getStats } from "@/lib/data/stats";

export const metadata = { title: "Stats · Builder Society" };

export default async function StatsPage() {
  await requireViewer();
  const s = await getStats();
  const tiles = [
    { label: "Updates this month", value: s.tiles.monthUpdates, icon: "📈" },
    {
      label: "Builders posting this month",
      value: `${s.tiles.monthBuilders}/${s.tiles.rankable}`,
      icon: "🧑‍💻",
    },
    { label: "Projects shipped", value: s.tiles.shipped, icon: "🚀" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          The group at a glance
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Counts builders only; exec board activity isn&apos;t included.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-2xl">{t.icon}</div>
            <div className="tabular mt-2 text-3xl font-black">{t.value}</div>
            <div className="text-muted-foreground text-sm">{t.label}</div>
          </Card>
        ))}
      </div>

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
          <EmptyState icon="📅">
            Attendance shows up here once check-ins start (Phase 3).
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
