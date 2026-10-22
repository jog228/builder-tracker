"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
        <p className="font-semibold">Check your inbox ✉️</p>
        <p className="mt-1 text-emerald-200/80">
          We sent you a login link. Open it in this browser to sign in.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@lehigh.edu"
        className="placeholder:text-muted-foreground/60 focus:border-primary/60 h-11 rounded-xl border bg-white/5 px-4 outline-none"
      />
      <button
        disabled={pending}
        className="bg-primary text-primary-foreground h-11 rounded-xl font-semibold transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a login link"}
      </button>
      {state.status === "error" && (
        <p className="text-sm text-rose-300">{state.message}</p>
      )}
    </form>
  );
}
