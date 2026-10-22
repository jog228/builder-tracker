"use client";

import { HandHeart, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  awardCommunityPoints,
  undoCommunityPoints,
} from "@/app/(app)/builders/[id]/actions";
import { Card, SectionTitle } from "@/components/bs/bits";
import { Icon } from "@/components/bs/icon";
import { cn } from "@/lib/utils";

const OTHER = "Other";

/**
 * Admin-only "Award points" card on someone else's profile: a required
 * reason, then +5 or +10.
 */
export function AwardPoints({
  memberId,
  firstName,
  amounts,
  reasons,
}: {
  memberId: string;
  firstName: string;
  amounts: readonly number[];
  reasons: readonly string[];
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const reasonReady = reason === OTHER ? other.trim().length >= 3 : !!reason;

  const award = (amount: number) =>
    start(async () => {
      const res = await awardCommunityPoints(
        memberId,
        amount,
        reason!,
        reason === OTHER ? other : null,
      );
      if (res.ok) {
        setMessage({
          ok: true,
          text: `Awarded +${res.points} to ${firstName} for “${res.reason}”.`,
        });
        setReason(null);
        setOther("");
      } else setMessage({ ok: false, text: res.error });
    });

  return (
    <Card>
      <SectionTitle hint="admins only">Award points</SectionTitle>
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-2 text-sm font-bold tracking-widest uppercase">
          What for?{" "}
          <span className="text-slate font-normal tracking-normal normal-case">
            (shown on their profile)
          </span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {[...reasons, OTHER].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "border-ink min-h-10 border-2 px-3 text-sm font-bold tracking-wider uppercase",
                reason === r ? "bg-ink text-paper" : "hover:bg-concrete",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === OTHER && (
          <label className="flex flex-col gap-1 text-sm font-bold tracking-widest uppercase">
            Reason
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={120}
              placeholder="e.g. Ran the sign-in table"
              className="border-ink min-h-11 border-2 bg-white px-3 text-lg font-normal tracking-normal normal-case"
            />
          </label>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {amounts.map((a) => (
            <button
              key={a}
              type="button"
              disabled={!reasonReady}
              onClick={() => award(a)}
              className="bg-safety inline-flex min-h-12 items-center justify-center gap-1.5 border-2 border-[#111] px-5 text-lg font-bold text-[#111] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon icon={HandHeart} /> +{a}
            </button>
          ))}
        </div>
      </fieldset>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={cn(
            "mt-3 font-semibold",
            message.ok ? "text-ok" : "text-bad",
          )}
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}

/** Admin "Undo" next to a community award in the Bonus Points card. */
export function UndoAward({ bonusId }: { bonusId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={pending}
      title={error ?? "Undo this award (records who removed it)"}
      onClick={() =>
        start(async () => {
          const res = await undoCommunityPoints(bonusId);
          setError(res.ok ? null : res.error);
        })
      }
      className="border-ink hover:bg-concrete inline-flex min-h-8 items-center gap-1 border-2 px-2 text-xs font-bold tracking-wider uppercase disabled:opacity-50"
    >
      <Icon icon={Undo2} /> {pending ? "…" : error ? "Failed" : "Undo"}
    </button>
  );
}
