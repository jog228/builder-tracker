"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  respondTeammateByToken,
  type TokenResponse,
} from "@/app/(app)/teammates/actions";
import { Icon } from "@/components/bs/icon";
import { cn } from "@/lib/utils";

/** Confirm / Decline for an email link; the link's choice is highlighted. */
export function RespondButtons({
  token,
  requesterName,
  preferred,
}: {
  token: string;
  requesterName: string;
  preferred: "confirm" | "decline";
}) {
  const [res, setRes] = useState<TokenResponse | null>(null);
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => setRes(await respondTeammateByToken(token, accept)));

  if (res?.ok)
    return res.result === "confirmed" ? (
      <p className="text-lg">
        You and{" "}
        <Link
          href={`/builders/${res.requesterId}`}
          className="text-rust font-bold underline"
        >
          {res.requesterName ?? requesterName}
        </Link>{" "}
        are teammates. You&rsquo;ll both show up on each other&rsquo;s builder
        file.
      </p>
    ) : (
      <p className="text-lg">
        Declined. It won&rsquo;t show on either profile.
      </p>
    );

  const button =
    "inline-flex min-h-12 items-center gap-2 border-2 px-5 font-bold tracking-wider uppercase disabled:opacity-50";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg leading-snug">
        {requesterName} says you&rsquo;re building together. Confirm and
        you&rsquo;ll show up as teammates on each other&rsquo;s builder file.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          disabled={pending}
          onClick={() => answer(true)}
          className={cn(
            button,
            preferred === "confirm"
              ? "bg-safety border-[#111] text-[#111]"
              : "border-ink text-ink hover:bg-concrete",
          )}
        >
          <Icon icon={Check} /> {pending ? "Saving…" : "Confirm"}
        </button>
        <button
          disabled={pending}
          onClick={() => answer(false)}
          className={cn(
            button,
            preferred === "decline"
              ? "bg-ink text-paper border-ink"
              : "border-ink text-ink hover:bg-concrete",
          )}
        >
          <Icon icon={X} /> Decline
        </button>
      </div>
      {res && !res.ok && (
        <div role="alert" className="text-bad">
          <p className="font-bold">{res.title}</p>
          <p>{res.body}</p>
        </div>
      )}
    </div>
  );
}
