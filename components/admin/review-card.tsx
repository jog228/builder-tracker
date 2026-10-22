"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTransition } from "react";
import { decideShipped, reopenShipped } from "@/app/(app)/admin/actions";
import { Stamp } from "@/components/bs/site";
import type { QueueItem } from "@/lib/data/shipped-review";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ReviewCard({
  item,
  first,
}: {
  item: QueueItem;
  first: boolean;
}) {
  const [pending, start] = useTransition();
  const decide = (d: "shipped" | "progress") =>
    start(() => decideShipped(item.messageId, d));

  return (
    <motion.article
      layout
      exit={{ opacity: 0, x: 60 }}
      className={cn(
        "bg-paper border-ink border-[3px] p-4 sm:p-6",
        first && "shadow-[8px_8px_0_var(--safety)]",
        pending && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-slate text-xs font-bold tracking-[0.16em] uppercase">
            Permit application{first && " · up next"}
          </span>
          <Link
            href={`/builders/${item.memberId}`}
            className="text-xl font-bold hover:underline"
          >
            {item.name}
          </Link>
          <span className="text-slate flex flex-wrap items-center gap-x-2">
            {item.project && (
              <span className="text-ink font-semibold">{item.project}</span>
            )}
            <span>
              {item.channel} · {shortDate(item.createdAt)}
            </span>
            {item.source === "manual" && (
              <span className="border-rust text-rust border-2 px-1.5 text-xs font-bold tracking-wider uppercase">
                Flagged by exec
              </span>
            )}
          </span>
        </div>
        <Stamp tone="pending" className="mt-1">
          Pending
        </Stamp>
      </header>

      {item.summary && (
        <p className="mt-3 text-lg font-semibold">{item.summary}</p>
      )}
      <blockquote className="text-slate border-ink mt-2 border-l-[3px] pl-3 whitespace-pre-line">
        {item.text}
      </blockquote>

      {item.media.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.media.map((m) =>
            m.type === "image" ? (
              <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- GroupMe media, shown as-is */}
                <img
                  src={m.url}
                  alt="Attached screenshot"
                  className="border-ink h-28 border-2 object-cover"
                />
              </a>
            ) : (
              <a
                key={m.url}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="border-ink hover:bg-concrete inline-flex min-h-10 items-center border-2 px-3 text-sm font-semibold"
              >
                {m.type === "video"
                  ? "▶ Watch demo video"
                  : `🔗 ${new URL(m.url).hostname}`}
              </a>
            ),
          )}
        </div>
      )}

      <footer className="border-dash mt-4 flex flex-wrap items-center gap-2 border-t border-dashed pt-4">
        <button
          disabled={pending}
          onClick={() => decide("shipped")}
          className="bg-safety min-h-12 border-2 border-[#111] px-5 font-bold tracking-[0.08em] text-[#111] uppercase hover:brightness-105 disabled:opacity-50"
        >
          Approve: shipped
        </button>
        <button
          disabled={pending}
          onClick={() => decide("progress")}
          className="border-ink hover:bg-concrete min-h-12 border-2 px-5 font-bold tracking-[0.08em] uppercase disabled:opacity-50"
        >
          No, just progress
        </button>
        <span className="text-slate w-full text-sm sm:ml-auto sm:w-auto">
          Counts as progress
          {item.substance !== null ? ` (substance ${item.substance})` : ""}{" "}
          until you decide
        </span>
      </footer>
    </motion.article>
  );
}

export function ReopenButton({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => reopenShipped(messageId))}
      className="border-ink hover:bg-concrete min-h-9 border-2 px-2.5 text-sm font-bold tracking-wider uppercase disabled:opacity-50"
    >
      {pending ? "…" : "Reopen"}
    </button>
  );
}
