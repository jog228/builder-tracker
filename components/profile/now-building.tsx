"use client";

import { HardHat, Pencil, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { saveNowBuilding } from "@/app/(app)/builders/[id]/actions";
import { Icon } from "@/components/bs/icon";
import { dayLabel, plural } from "@/lib/format";
import type { NowBuildingCard as Card } from "@/lib/summaries/now-building";
import { cn } from "@/lib/utils";

/** A hard-hat "NOW BUILDING" site sign. Admins can edit the text. */
export function NowBuilding({
  memberId,
  card,
  canEdit,
}: {
  memberId: string;
  card: Exclude<Card, null>;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const summary = card.kind === "summary" ? card : null;

  return (
    <section
      aria-labelledby="now-building"
      className="border-ink bg-paper border-[3px] shadow-[6px_6px_0_var(--ink)]"
    >
      <h2
        id="now-building"
        className="bg-safety border-ink flex items-center gap-2 border-b-[3px] px-4 py-2 text-[#111] sm:px-6"
      >
        <Icon icon={HardHat} className="text-xl" />
        <span className="font-display text-xl leading-none tracking-wide uppercase">
          Now building
        </span>
      </h2>

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
        {summary?.project && (
          <p className="font-display text-[clamp(1.6rem,6vw,2.25rem)] leading-none uppercase">
            {summary.project}
          </p>
        )}

        {editing && summary ? (
          <Editor
            memberId={memberId}
            initial={summary.text}
            generated={summary.generated}
            edited={!!summary.edited}
            onDone={() => setEditing(false)}
          />
        ) : (
          <p
            className={cn(
              "max-w-3xl text-xl leading-snug",
              card.kind === "empty" && "text-slate",
            )}
          >
            {card.text}
          </p>
        )}

        <div className="text-slate flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold tracking-wider uppercase">
          {summary && (
            <span>
              From {plural(summary.updateCount, "update")}
              {summary.lastPostAt && (
                <> · last post {dayLabel(summary.lastPostAt)}</>
              )}
            </span>
          )}
          {canEdit && summary?.edited && (
            <span className="text-rust">
              Edited{summary.edited.by ? ` by ${summary.edited.by}` : ""}
              {summary.edited.at ? ` · ${dayLabel(summary.edited.at)}` : ""}
            </span>
          )}
          {canEdit && summary && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="border-ink text-ink hover:bg-concrete inline-flex min-h-9 items-center gap-1.5 border-2 px-2.5 font-bold"
            >
              <Icon icon={Pencil} /> Edit
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Editor({
  memberId,
  initial,
  generated,
  edited,
  onDone,
}: {
  memberId: string;
  initial: string;
  generated: string | null;
  edited: boolean;
  onDone: () => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (value: string | null) =>
    start(async () => {
      const res = await saveNowBuilding(memberId, value);
      if (res.ok) onDone();
      else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="now-building-text"
        className="text-sm font-bold tracking-widest uppercase"
      >
        Summary (admins only)
      </label>
      <textarea
        id="now-building-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={400}
        rows={3}
        className="border-ink w-full max-w-3xl border-2 bg-white px-3 py-2 text-lg leading-snug"
      />
      {generated && edited && (
        <p className="text-slate max-w-3xl text-sm">Generated: “{generated}”</p>
      )}
      {error && (
        <p role="alert" className="text-bad font-semibold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 font-bold tracking-wider uppercase">
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() => save(text)}
          className="bg-safety min-h-11 border-2 border-[#111] px-4 text-[#111] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {edited && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save(null)}
            className="border-ink hover:bg-concrete inline-flex min-h-11 items-center gap-1.5 border-2 px-4 disabled:opacity-50"
          >
            <Icon icon={RotateCcw} /> Reset to generated
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onDone}
          className="border-ink hover:bg-concrete min-h-11 border-2 px-4 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
