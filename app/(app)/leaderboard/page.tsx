import Link from "next/link";
import { Card, EmptyState } from "@/components/bs/bits";
import { Podium } from "@/components/leaderboard/podium";
import { RankedList } from "@/components/leaderboard/ranked-list";
import { requireViewer } from "@/lib/auth";
import { getLeaderboard, type Period } from "@/lib/data/leaderboard";
import { monthLabel, plural, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leaderboard · Builder Society" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const period: Period =
    (await searchParams).period === "all" ? "all" : "month";
  const { rows, updatedAt, periodKey } = await getLeaderboard(period);
  const me = rows.find((r) => r.memberId === viewer.memberId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary text-sm font-medium">
            {period === "all" ? "All time" : monthLabel(periodKey)}
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Who&apos;s building the most?
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Points come from progress posts, shipping, helping others, likes,
            streaks and bonuses.
            {updatedAt && <> Updated {timeAgo(updatedAt)}.</>}
          </p>
        </div>
        <div className="flex rounded-full border bg-white/5 p-1 text-sm">
          {(["month", "all"] as const).map((p) => (
            <Link
              key={p}
              href={p === "all" ? "/leaderboard?period=all" : "/leaderboard"}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium transition-colors",
                p === period
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "all" ? "All time" : "This month"}
            </Link>
          ))}
        </div>
      </div>

      {viewer.isExcluded && (
        <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
          You&apos;re on the exec board, so you&apos;re not ranked. Your posts
          still sync, but they never count toward scores.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="🏗️">
          No scores yet. They appear after the next score computation.
        </EmptyState>
      ) : (
        <>
          <Card className="overflow-hidden pb-0">
            <Podium top={rows.slice(0, 3)} />
          </Card>

          {me && (
            <p className="text-muted-foreground text-center text-sm">
              You&apos;re{" "}
              <span className="text-foreground font-semibold">#{me.rank}</span>{" "}
              of {rows.length} with{" "}
              <span className="text-primary font-semibold">
                {plural(me.total, "point")}
              </span>
              .
            </p>
          )}

          <RankedList rows={rows} viewerId={viewer.memberId} />
        </>
      )}
    </div>
  );
}
