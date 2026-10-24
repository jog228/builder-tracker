import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import { Eyebrow, PageTitle, Stamp } from "@/components/bs/site";
import { ReopenButton, ReviewCard } from "@/components/admin/review-card";
import { requireAdmin } from "@/lib/auth";
import { getShippedReview } from "@/lib/data/shipped-review";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Permits · Builder Society" };

export default async function ShippedReviewPage() {
  await requireAdmin();
  const { items, history } = await getShippedReview();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Exec board · shipped review</Eyebrow>
        <PageTitle className="mt-3">Building permits</PageTitle>
        <p className="text-slate mt-3 max-w-2xl text-lg leading-snug">
          Claude flags posts that might be launches. A post only earns shipped
          points (25, once per project) after an exec member says yes. Until
          then it counts as a progress update. Scores refresh as soon as you
          decide.
        </p>
      </div>

      {items.length ? (
        <div className="flex flex-col gap-4">
          {items.map((item, i) => (
            <ReviewCard key={item.messageId} item={item} first={i === 0} />
          ))}
        </div>
      ) : (
        <EmptyState icon={BadgeCheck}>
          All caught up. Nothing waiting for review.
        </EmptyState>
      )}

      <Card>
        <SectionTitle hint="latest 30">Decisions</SectionTitle>
        <p className="text-slate -mt-2 mb-4 text-sm">
          Approvals and project moves. A row is one post: approving two posts
          for the same project shows two rows, but the project still earns
          shipped points once.
        </p>
        {history.length ? (
          <ul className="flex flex-col gap-3">
            {history.map((d) => (
              <li
                key={d.key}
                className="border-dash flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-dashed pb-3"
              >
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`/builders/${d.memberId}`}
                    className="font-bold hover:underline"
                  >
                    {d.name}
                  </Link>
                  <span className="text-slate text-[0.95rem]">
                    {d.kind === "project" ? (
                      <>
                        {d.fromProject ?? "No project"} → {d.project} ·{" "}
                      </>
                    ) : (
                      d.project && <>{d.project} · </>
                    )}
                    {d.decidedBy ?? "someone"} · {timeAgo(d.decidedAt)}
                  </span>
                  {d.kind === "project" && d.summary && (
                    <span className="text-slate text-sm italic">
                      {d.summary}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {d.kind === "project" ? (
                    <Stamp tone="neutral">Project moved</Stamp>
                  ) : d.status === "shipped" ? (
                    <>
                      <Stamp tone="approved">Approved</Stamp>
                      <ReopenButton messageId={d.messageId} />
                    </>
                  ) : (
                    <>
                      <Stamp tone="neutral">Progress</Stamp>
                      <ReopenButton messageId={d.messageId} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate">No decisions yet.</p>
        )}
      </Card>
    </div>
  );
}
