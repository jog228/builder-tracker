"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithGoogle, sendMagicLink, type LoginState } from "./actions";

export function GoogleButton() {
  return (
    <form action={signInWithGoogle}>
      <GoogleSubmit />
    </form>
  );
}

function GoogleSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-safety flex h-14 w-full items-center justify-center gap-3 border-2 border-[#111] text-lg font-bold tracking-[0.08em] text-[#111] uppercase transition hover:brightness-105 disabled:opacity-60"
    >
      <span className="flex size-7 items-center justify-center bg-white">
        <GoogleG />
      </span>
      {pending ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Backup magic link, exec board only. */
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="border-ok text-ok border-[3px] p-4">
        <p className="font-bold tracking-wider uppercase">Check your inbox</p>
        <p className="text-ink mt-1">
          We sent you a login link. Open it in this browser to sign in.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label
        htmlFor="email"
        className="text-sm font-bold tracking-widest uppercase"
      >
        Exec board email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@lehigh.edu"
        className="border-ink placeholder:text-slate h-12 border-2 bg-white px-3 text-lg"
      />
      <button
        disabled={pending}
        className="border-ink hover:bg-concrete h-12 border-2 font-bold tracking-[0.08em] uppercase transition disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a login link"}
      </button>
      {state.status === "error" && (
        <p className="text-bad font-semibold">{state.message}</p>
      )}
    </form>
  );
}
