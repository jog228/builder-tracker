"use client";

import { useState, useTransition } from "react";
import { flagShipped } from "@/app/(app)/admin/actions";

export function FlagShippedButton({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <button
      onClick={() =>
        start(async () => {
          const res = await flagShipped(messageId);
          setError(res.ok ? null : res.error);
        })
      }
      disabled={pending}
      className="border-ink text-ink hover:border-rust hover:text-rust min-h-8 border-2 px-2 text-xs font-bold tracking-wider uppercase disabled:opacity-50"
      title="Admins: send this post to the permits (shipped review) queue"
    >
      {pending ? "Flagging…" : error ? "Not allowed" : "Flag for permit"}
    </button>
  );
}
