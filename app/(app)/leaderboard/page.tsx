import { Construction } from "lucide-react";
import Link from "next/link";
import { EmptyState, toggleClass } from "@/components/bs/bits";
import { Eyebrow, PageTitle } from "@/components/bs/site";
import { CraneSign } from "@/components/leaderboard/crane-sign";
import { RankedList } from "@/components/leaderboard/ranked-list";
import { requireViewer } from "@/lib/auth";
import { getLeaderboard, type Period } from "@/lib/data/leaderboard";
import { monthLabel, plural, timeAgo } from "@/lib/format";

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
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <Eyebrow>
            Daily site report ·{" "}
            {period === "all" ? "All time" : monthLabel(periodKey)}
          </Eyebrow>
          <PageTitle>Top builders on site</PageTitle>
          <p className="text-slate max-w-[560px] text-xl leading-snug">
            Progress posts pour the foundation. Ships, demos, help, likes and
            streaks raise the frame.
            {updatedAt && <> Report updated {timeAgo(updatedAt)}.</>}
          </p>
          <div role="group" aria-label="Period" className="flex gap-2">
            {(["month", "all"] as const).map((p) => (
              <Link
                key={p}
                href={p === "all" ? "/leaderboard?period=all" : "/leaderboard"}
                aria-current={p === period ? "page" : undefined}
                className={toggleClass(p === period)}
              >
                {p === "all" ? "All time" : "This month"}
              </Link>
            ))}
          </div>
        </div>
        {rows[0] && (
          <div className="flex-[1_1_300px] sm:flex-[1_1_340px]">
            <CraneSign
              leader={rows[0]}
              runnerUp={rows[1]}
              allTime={period === "all"}
            />
          </div>
        )}
      </section>

      {viewer.isExcluded && (
        <div className="bg-paper border-ink border-[3px] border-l-[12px] px-4 py-3">
          You&apos;re on the exec board, so you&apos;re not ranked. Your posts
          still sync, but they never count toward scores.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Construction}>
          No scores yet. They appear after the next score computation.
        </EmptyState>
      ) : (
        <>
          {me && (
            <p className="text-slate text-center text-lg">
              You&apos;re <span className="text-ink font-bold">#{me.rank}</span>{" "}
              of {rows.length} with{" "}
              <span className="text-ink bg-safety px-1 font-bold">
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
