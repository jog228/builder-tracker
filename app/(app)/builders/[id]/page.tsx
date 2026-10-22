import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/bs/avatar";
import {
  Card,
  CategoryChip,
  EmptyState,
  RankChange,
  SectionTitle,
  Streak,
} from "@/components/bs/bits";
import { ScoreBreakdown } from "@/components/profile/breakdown";
import { FlagShippedButton } from "@/components/profile/flag-button";
import { ActivityHeatmap } from "@/components/profile/heatmap";
import { requireViewer } from "@/lib/auth";
import { getProfile, type ProfileSnapshot } from "@/lib/data/profile";
import { monthLabel, shortDate } from "@/lib/format";
import { monthKey } from "@/lib/scoring/time";
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
  const streak = p.all?.breakdown.streak_weeks ?? { current: 0, longest: 0 };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/leaderboard"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Leaderboard
      </Link>

      {/* Header */}
      <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <MemberAvatar
          name={member.display_name}
          url={member.avatar_url}
          size={96}
          className="ring-primary/30 ring-4"
        />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-black tracking-tight">
            {member.display_name}
          </h1>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm sm:justify-start">
            {excluded ? (
              <span className="rounded-full bg-violet-400/15 px-2.5 py-0.5 text-violet-200">
                Exec board · not ranked
              </span>
            ) : (
              <>
                {streak.current > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Streak weeks={streak.current} size="lg" /> week streak
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
          <div className="grid grid-cols-2 gap-3">
            <RankStat
              label={monthLabel(monthKey(new Date())).split(" ")[0]}
              snap={p.month}
            />
            <RankStat label="All time" snap={p.all} />
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-6">
          {!excluded && (
            <Card>
              <SectionTitle
                hint={
                  <span className="flex rounded-full border p-0.5">
                    {[false, true].map((all) => (
                      <Link
                        key={String(all)}
                        href={all ? `?period=all` : "?"}
                        className={cn(
                          "rounded-full px-2.5 py-0.5",
                          all === allTime && "text-foreground bg-white/10",
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
                  />
                  <div className="mt-4 flex items-baseline justify-between border-t pt-3">
                    <span className="text-muted-foreground text-sm">Total</span>
                    <span className="tabular text-primary text-2xl font-black">
                      {shown.total}
                    </span>
                  </div>
                </>
              ) : (
                <EmptyState icon="🧮">No score yet.</EmptyState>
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
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-center",
                    b.earned
                      ? "border-primary/40 bg-primary/10"
                      : "opacity-35 grayscale",
                  )}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <span className="text-[10px] leading-tight font-medium">
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
              <ul className="flex flex-col divide-y divide-white/5">
                {p.updates.map((u) => (
                  <li key={u.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      <CategoryChip category={u.category} />
                      {u.rawCategory === "shipped_candidate" &&
                        u.approval === "pending" && (
                          <span className="text-amber-300/80">
                            awaiting exec review
                          </span>
                        )}
                      {u.project && (
                        <span className="text-foreground/80 font-medium">
                          {u.project}
                        </span>
                      )}
                      <span>{shortDate(u.createdAt)}</span>
                      {u.likes > 0 && <span>❤️ {u.likes}</span>}
                      {viewer.isAdmin &&
                        !excluded &&
                        u.category === "progress_update" &&
                        u.approval === null && (
                          <span className="ml-auto">
                            <FlagShippedButton messageId={u.id} />
                          </span>
                        )}
                    </div>
                    <p className="mt-1.5 text-sm">{u.summary ?? u.text}</p>
                    <details className="text-muted-foreground mt-1 text-xs">
                      <summary className="hover:text-foreground cursor-pointer select-none">
                        Original post
                      </summary>
                      <p className="mt-1 whitespace-pre-line">{u.text}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="📝">
                {excluded
                  ? "Exec board posts aren't scored."
                  : "No scored updates yet."}
              </EmptyState>
            )}
          </Card>

          {p.bonuses.length > 0 && (
            <Card>
              <SectionTitle>Bonus points</SectionTitle>
              <ul className="flex flex-col gap-2 text-sm">
                {p.bonuses.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span>
                      {b.type === "demo"
                        ? `🎤 Demoed at ${b.eventName ?? "an event"}`
                        : `🎁 ${b.reason}`}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {shortDate(b.awardedAt)}
                      </span>
                    </span>
                    <span className="tabular text-primary font-semibold">
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
              <ul className="flex flex-col gap-2 text-sm">
                {p.events.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{e.name}</span>
                    <span className="text-muted-foreground">
                      {shortDate(`${e.date}T12:00:00Z`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="📅">
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
    <div className="min-w-28 rounded-xl border bg-white/[0.03] px-4 py-3 text-center">
      <div className="text-muted-foreground text-xs">{label}</div>
      {snap ? (
        <>
          <div className="flex items-center justify-center gap-1.5">
            <span className="tabular text-2xl font-black">#{snap.rank}</span>
            <RankChange rank={snap.rank} prevRank={snap.prevRank} />
          </div>
          <div className="tabular text-muted-foreground text-xs">
            {snap.total} pts · of {snap.of}
          </div>
        </>
      ) : (
        <div className="text-muted-foreground text-2xl font-black">–</div>
      )}
    </div>
  );
}
