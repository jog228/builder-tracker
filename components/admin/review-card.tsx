"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTransition } from "react";
import { decideShipped, reopenShipped } from "@/app/(app)/admin/actions";
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
        "bg-card/80 rounded-2xl border p-5 shadow-xl shadow-black/20",
        first && "border-primary/40 ring-primary/30 ring-1",
        pending && "opacity-60",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          href={`/builders/${item.memberId}`}
          className="font-semibold hover:underline"
        >
          {item.name}
        </Link>
        {item.project && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs">
            {item.project}
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          {item.channel} · {shortDate(item.createdAt)}
        </span>
        {item.source === "manual" && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
            🚩 flagged
          </span>
        )}
        {first && (
          <span className="text-primary ml-auto text-xs font-semibold">
            Up next
          </span>
        )}
      </header>

      {item.summary && (
        <p className="mt-3 text-sm font-medium">{item.summary}</p>
      )}
      <blockquote className="text-muted-foreground mt-2 border-l-2 border-white/10 pl-3 text-sm whitespace-pre-line">
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
                  className="h-28 rounded-lg border object-cover"
                />
              </a>
            ) : (
              <a
                key={m.url}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border px-3 py-1.5 text-xs text-sky-300 hover:bg-white/5"
              >
                {m.type === "video"
                  ? "▶ Watch demo video"
                  : `🔗 ${new URL(m.url).hostname}`}
              </a>
            ),
          )}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => decide("shipped")}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-50"
        >
          🚀 Yes, shipped
        </button>
        <button
          disabled={pending}
          onClick={() => decide("progress")}
          className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
        >
          No, just progress
        </button>
        <span className="text-muted-foreground ml-auto self-center text-xs">
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
      className="text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-50"
    >
      {pending ? "…" : "Reopen"}
    </button>
  );
}
