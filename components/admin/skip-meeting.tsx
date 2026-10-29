"use client";

import { CalendarX, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { skipMeeting, unskipMeeting } from "@/app/(app)/admin/checkin/actions";
import { Icon } from "@/components/bs/icon";

/**
 * "No meeting this week" on the check-in page (admins only; the page is
 * admin-only). Opens a small form with an optional note, then marks the
 * selected date skipped and removes its meeting. If anyone is signed in, it
 * says so and asks again before removing their sign-ins.
 */
export function SkipMeeting({
  date,
  title,
  label,
  signIns,
}: {
  date: string;
  /** "Thu, Oct 29". */
  title: string;
  label: string;
  /** Sign-ins as of page load (the server re-checks). */
  signIns: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
    setError(null);
    setConfirm(signIns);
  };

  const skip = () =>
    start(async () => {
      const res = await skipMeeting(date, note.trim(), confirm > 0);
      if (res.ok) {
        setOpen(false);
        router.push("/admin/checkin");
      } else if ("confirmSignIns" in res) {
        setConfirm(res.confirmSignIns);
        setError(null);
      } else setError(res.error);
    });

  const field =
    "border-ink min-h-11 w-full border-2 bg-white px-3 text-lg font-normal tracking-normal normal-case";

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="skip-meeting-form"
        onClick={toggle}
        className="border-ink hover:bg-paper inline-flex min-h-11 w-full items-center justify-center gap-1.5 border-2 px-4 font-bold tracking-wider whitespace-nowrap uppercase sm:w-auto"
      >
        <Icon icon={CalendarX} /> {label}
      </button>

      {open && (
        <div
          id="skip-meeting-form"
          role="dialog"
          aria-label={`No meeting on ${title}`}
          className="bg-paper border-ink absolute top-full right-0 left-0 z-20 mt-2 flex flex-col gap-3 border-[3px] p-4 shadow-[6px_6px_0_var(--ink)] sm:left-auto sm:w-[22rem]"
        >
          <p className="font-display text-xl leading-none uppercase">
            No meeting · {title}
          </p>
          <p className="text-slate text-sm leading-snug">
            Check-in stops offering this date and it doesn&apos;t count as a
            meeting held. Undo it any time.
          </p>
          <label className="flex flex-col gap-1 text-sm font-bold tracking-widest uppercase">
            Note (optional)
            <input
              ref={firstField}
              value={note}
              maxLength={200}
              placeholder="e.g. Moved to Thu, Nov 5"
              onChange={(e) => setNote(e.target.value)}
              className={field}
            />
          </label>
          {confirm > 0 && (
            <p
              role="alert"
              className="border-rust text-rust border-2 px-3 py-2 font-semibold"
            >
              {confirm} {confirm === 1 ? "builder is" : "builders are"} signed
              in. Skipping removes {confirm === 1 ? "that sign-in" : "them"} and
              the points.
            </p>
          )}
          {error && (
            <p role="alert" className="text-bad font-semibold">
              {error}
            </p>
          )}
          <div className="flex gap-2 font-bold tracking-wider uppercase">
            <button
              type="button"
              disabled={pending}
              onClick={skip}
              className="bg-safety min-h-11 flex-1 border-2 border-[#111] px-4 text-[#111] disabled:opacity-50"
            >
              {pending
                ? "Skipping…"
                : confirm > 0
                  ? `Remove ${confirm} & skip`
                  : "Skip meeting"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="border-ink hover:bg-concrete min-h-11 border-2 px-4 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Skipped dates, each with its note and "Undo skip". */
export function SkippedDays({
  skips,
}: {
  skips: { date: string; title: string; reason: string | null }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  if (!skips.length) return null;

  const undo = (date: string) => {
    setBusy(date);
    start(async () => {
      const res = await unskipMeeting(date);
      setBusy(null);
      if (res.ok) {
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <section aria-label="Skipped meetings" className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {skips.map((s) => (
          <li
            key={s.date}
            className="border-dash text-slate flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-dashed px-3 py-1.5"
          >
            <span>
              <span className="text-ink font-bold tracking-wider uppercase">
                No meeting
              </span>{" "}
              · {s.title}
              {s.reason && <> · {s.reason}</>}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => undo(s.date)}
              className="text-ink ml-auto inline-flex min-h-11 items-center gap-1 font-bold tracking-wider uppercase underline-offset-4 hover:underline disabled:opacity-50"
            >
              <Icon icon={Undo2} /> {busy === s.date ? "Undoing…" : "Undo skip"}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-bad font-semibold">
          {error}
        </p>
      )}
    </section>
  );
}
