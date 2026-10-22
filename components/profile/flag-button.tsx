"use client";

import { useTransition } from "react";
import { flagShipped } from "@/app/(app)/admin/actions";

export function FlagShippedButton({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => flagShipped(messageId))}
      disabled={pending}
      className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] hover:border-amber-300/50 hover:text-amber-300 disabled:opacity-50"
      title="Admins: send this post to the shipped review queue"
    >
      {pending ? "Flagging…" : "🚩 Flag as shipped"}
    </button>
  );
}
