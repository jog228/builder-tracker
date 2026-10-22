import Link from "next/link";
import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import { ReopenButton, ReviewCard } from "@/components/admin/review-card";
import { requireAdmin } from "@/lib/auth";
import { getShippedReview } from "@/lib/data/shipped-review";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Shipped review · Builder Society" };

export default async function ShippedReviewPage() {
  await requireAdmin();
  const { items, history } = await getShippedReview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-primary text-sm font-medium">Exec board</p>
        <h1 className="text-3xl font-black tracking-tight">Shipped review</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
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
        <EmptyState icon="✅">
          All caught up. Nothing waiting for review.
        </EmptyState>
      )}

      <Card>
        <SectionTitle hint="latest 30">Decisions</SectionTitle>
        {history.length ? (
          <ul className="flex flex-col divide-y divide-white/5 text-sm">
            {history.map((d) => (
              <li
                key={d.messageId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span
                  className={
                    d.status === "shipped"
                      ? "text-emerald-300"
                      : "text-muted-foreground"
                  }
                >
                  {d.status === "shipped" ? "🚀 Shipped" : "📈 Progress"}
                </span>
                <Link
                  href={`/builders/${d.memberId}`}
                  className="font-medium hover:underline"
                >
                  {d.name}
                </Link>
                {d.project && (
                  <span className="text-muted-foreground">{d.project}</span>
                )}
                <span className="text-muted-foreground ml-auto text-xs">
                  {d.decidedBy ?? "someone"} · {timeAgo(d.decidedAt)}
                </span>
                <ReopenButton messageId={d.messageId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No decisions yet.</p>
        )}
      </Card>
    </div>
  );
}
