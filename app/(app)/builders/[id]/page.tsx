import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Calculator,
  CalendarDays,
  Gift,
  Heart,
  MonitorPlay,
  NotebookPen,
} from "lucide-react";
import { MemberAvatar } from "@/components/bs/avatar";
import {
  Card,
  CategoryChip,
  EmptyState,
  RankChange,
  SectionTitle,
  toggleClass,
} from "@/components/bs/bits";
import { CountUp } from "@/components/bs/count-up";
import { badgeIcon, Icon } from "@/components/bs/icon";
import { Eyebrow } from "@/components/bs/site";
import { ScoreBreakdown } from "@/components/profile/breakdown";
import { FlagShippedButton } from "@/components/profile/flag-button";
import { NowBuilding } from "@/components/profile/now-building";
import { ActivityHeatmap } from "@/components/profile/heatmap";
import { attendanceRate, meetingsHeld } from "@/lib/attendance/meetings";
import { requireViewer } from "@/lib/auth";
import { getProfile, type ProfileSnapshot } from "@/lib/data/profile";
import { dayLabel, monthLabel, shortDate } from "@/lib/format";
import { localDate, monthKey } from "@/lib/scoring/time";
import { nowBuildingCard } from "@/lib/summaries/now-building";
import { cn } from "@/lib/utils";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;
  const allTime = (await searchParams).period === "all";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await getProfile(id);
  if (!p) notFound();

  const { member } = p;
  const excluded = member.exclude_from_rankings;
  const shown = allTime ? p.all : p.month;
  // Exec board (and inactive) members get no card.
  const nowBuilding = nowBuildingCard(
    member,
    p.summary,
    p.updates.some((u) => u.streak !== null && u.points > 0),
  );
  const now = new Date();
  const attendance = attendanceRate(
    meetingsHeld(p.meetings, {
      today: localDate(now),
      month: allTime ? null : monthKey(now),
    }),
    p.events.filter((e) => e.weekly).map((e) => e.date),
  );
  const streak = p.all?.breakdown.streak_weeks ?? { current: 0, longest: 0 };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/leaderboard"
        className="text-slate hover:text-rust inline-flex items-center gap-1.5 self-start font-bold tracking-wider uppercase"
      >
        <Icon icon={ArrowLeft} /> Progress schedule
      </Link>

      {/* Header */}
      <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <MemberAvatar
          name={member.display_name}
          url={member.avatar_url}
          size={96}
          className="border-[3px] shadow-[6px_6px_0_var(--safety)]"
        />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <Eyebrow>Builder file</Eyebrow>
          <h1 className="font-display mt-1 text-[clamp(2rem,7vw,3.25rem)] leading-none break-words uppercase">
            {member.display_name}
          </h1>
          <div className="text-slate mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-lg sm:justify-start">
            {excluded ? (
              <span className="bg-ink text-paper px-2.5 py-0.5 font-bold tracking-wider uppercase">
                Exec board · not ranked
              </span>
            ) : (
              <>
                {streak.current > 0 && (
                  <span className="text-ink font-semibold">
                    {streak.current}-week streak
                  </span>
                )}
                {streak.longest > 1 && (
                  <span>Longest: {streak.longest} weeks</span>
                )}
              </>
            )}
          </div>
        </div>
        {!excluded && (
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
            <RankStat
              label={monthLabel(monthKey(new Date())).split(" ")[0]}
              snap={p.month}
            />
            <RankStat label="All time" snap={p.all} />
          </div>
        )}
      </Card>

      {nowBuilding && (
        <NowBuilding
          memberId={member.id}
          card={nowBuilding}
          canEdit={viewer.isAdmin}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-6">
          {!excluded && (
            <Card>
              <SectionTitle
                hint={
                  <span className="flex gap-1.5">
                    {[false, true].map((all) => (
                      <Link
                        key={String(all)}
                        href={all ? `?period=all` : "?"}
                        aria-current={all === allTime ? "page" : undefined}
                        className={cn(
                          toggleClass(all === allTime, "sm"),
                          "text-ink tracking-wider",
                        )}
                      >
                        {all ? "All time" : "Month"}
                      </Link>
                    ))}
                  </span>
                }
              >
                Score breakdown
              </SectionTitle>
              {shown ? (
                <>
                  <ScoreBreakdown
                    breakdown={shown.breakdown}
                    monthly={!allTime}
                    attendance={attendance}
                  />
                  <div className="border-ink mt-4 flex items-baseline justify-between border-t-[3px] pt-3">
                    <span className="font-bold tracking-widest uppercase">
                      Total
                    </span>
                    <span className="font-display text-3xl">
                      <CountUp value={shown.total} />
                    </span>
                  </div>
                </>
              ) : (
                <EmptyState icon={Calculator}>No score yet.</EmptyState>
              )}
            </Card>
          )}

          <Card>
            <SectionTitle
              hint={`${p.badges.filter((b) => b.earned).length} of ${p.badges.length}`}
            >
              Badges
            </SectionTitle>
            <div className="grid grid-cols-4 gap-2">
              {p.badges.map((b) => (
                <div
                  key={b.slug}
                  title={`${b.name}: ${b.description}${b.earned ? "" : " (locked)"}`}
                  className={cn(
                    "border-ink flex flex-col items-center gap-1 border-2 p-2 text-center",
                    b.earned
                      ? "bg-safety"
                      : "border-dash border-dashed opacity-45 grayscale",
                  )}
                >
                  <Icon icon={badgeIcon(b.slug)} className="text-2xl" />
                  <span className="text-xs leading-tight font-bold uppercase">
                    {b.name}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle hint={`last ${p.heatmapWeeks} weeks`}>
              Activity
            </SectionTitle>
            <ActivityHeatmap timestamps={p.activity} weeks={p.heatmapWeeks} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle>Recent updates</SectionTitle>
            {p.updates.length ? (
              <ul className="divide-dash flex flex-col divide-y divide-dashed">
                {p.updates.map((u) => (
                  <li key={u.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="text-slate flex flex-wrap items-center gap-2 text-sm">
                      <CategoryChip category={u.category} />
                      {u.rawCategory === "shipped_candidate" &&
                        u.approval === "pending" && (
                          <span className="text-rust font-semibold">
                            awaiting exec review
                          </span>
                        )}
                      {u.project && (
                        <span className="text-ink font-bold">{u.project}</span>
                      )}
                      <span>{shortDate(u.createdAt)}</span>
                      {u.likes > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Icon icon={Heart} label="Likes" /> {u.likes}
                        </span>
                      )}
                      {viewer.isAdmin &&
                        !excluded &&
                        u.category === "progress_update" &&
                        u.approval === null && (
                          <span className="ml-auto">
                            <FlagShippedButton messageId={u.id} />
                          </span>
                        )}
                    </div>
                    <p className="mt-1.5 text-lg leading-snug">
                      {u.summary ?? u.text}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold">
                      <span
                        className={cn(
                          "border-2 px-1.5",
                          u.points
                            ? "border-ink bg-safety text-[#111]"
                            : "border-dash text-slate",
                        )}
                        title={
                          u.category === "shipped"
                            ? "Shipped points count once per project"
                            : "Before the monthly cap"
                        }
                      >
                        {u.points ? `+${u.points}` : "No points"}
                      </span>
                      {u.streak === true && (
                        <span className="text-ok inline-flex items-center gap-1">
                          <Icon icon={Check} /> Streak week
                        </span>
                      )}
                      {u.streak === false && (
                        <span className="text-slate font-semibold">
                          Too light for streak: add results/next steps
                        </span>
                      )}
                    </div>
                    <details className="text-slate mt-1 text-sm">
                      <summary className="hover:text-rust cursor-pointer font-semibold select-none">
                        Original post
                      </summary>
                      <p className="mt-1 whitespace-pre-line">{u.text}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={NotebookPen}>
                {excluded
                  ? "Exec board posts aren't scored."
                  : "No scored updates yet."}
              </EmptyState>
            )}
          </Card>

          {p.bonuses.length > 0 && (
            <Card>
              <SectionTitle>Bonus points</SectionTitle>
              <ul className="flex flex-col gap-2">
                {p.bonuses.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span>
                      <Icon
                        icon={b.type === "demo" ? MonitorPlay : Gift}
                        className="mr-1.5"
                      />
                      {b.type === "demo"
                        ? `Demoed at ${b.eventName ?? "an event"}`
                        : b.reason}
                      <span className="text-slate text-sm">
                        {" · "}
                        {dayLabel(b.date)}
                      </span>
                    </span>
                    <span className="font-display bg-safety px-1.5 text-lg">
                      +{b.points}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <SectionTitle>Events attended</SectionTitle>
            {p.events.length ? (
              <ul className="flex flex-col gap-2">
                {p.events.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{e.name}</span>
                    <span className="text-slate">{dayLabel(e.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarDays}>
                Attendance tracking is coming soon.
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function RankStat({
  label,
  snap,
}: {
  label: string;
  snap: ProfileSnapshot | null;
}) {
  return (
    <div className="border-ink bg-concrete min-w-28 border-2 px-4 py-3 text-center">
      <div className="text-xs font-bold tracking-widest uppercase">{label}</div>
      {snap ? (
        <>
          <div className="flex items-center justify-center gap-1.5">
            <span className="font-display text-3xl">#{snap.rank}</span>
            <RankChange rank={snap.rank} prevRank={snap.prevRank} />
          </div>
          <div className="tabular text-slate text-sm">
            {snap.total} pts · of {snap.of}
          </div>
        </>
      ) : (
        <div className="text-slate font-display text-3xl">–</div>
      )}
    </div>
  );
}
