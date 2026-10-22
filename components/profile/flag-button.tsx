"use client";

import { useTransition } from "react";
import { flagShipped } from "@/app/(app)/admin/actions";

export function FlagShippedButton({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => flagShipped(messageId))}
      disabled={pending}
      className="border-ink text-ink hover:border-rust hover:text-rust min-h-8 border-2 px-2 text-xs font-bold tracking-wider uppercase disabled:opacity-50"
      title="Admins: send this post to the permits (shipped review) queue"
    >
      {pending ? "Flagging…" : "Flag for permit"}
    </button>
  );
}
