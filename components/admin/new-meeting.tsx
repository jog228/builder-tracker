"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createMeeting } from "@/app/(app)/admin/checkin/actions";
import { Icon } from "@/components/bs/icon";

/**
 * "+ New meeting" on the check-in page (admins only; the page is admin-only).
 * Opens a small form: date (default: the Thursday after the latest meeting)
 * and time are editable; title and points are copied from the latest
 * meeting. One meeting per date, enforced by the server and the database.
 */
export function NewMeeting({
  defaultDate,
  defaultTime,
  title,
  signInPoints,
  demoPoints,
  minDate,
  maxDate,
}: {
  defaultDate: string;
  /** "HH:MM", 24-hour. */
  defaultTime: string;
  title: string;
  signInPoints: number;
  demoPoints: number;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [error, setError] = useState<{
    text: string;
    conflictDate?: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const create = () =>
    start(async () => {
      const res = await createMeeting(date, time);
      if (res.ok) {
        setOpen(false);
        setError(null);
        router.push(`/admin/checkin?date=${res.date}`);
      } else
        setError({
          text: res.error,
          conflictDate: res.status === 409 ? res.conflictDate : undefined,
        });
    });

  const field =
    "border-ink min-h-11 w-full border-2 bg-white px-3 text-lg font-normal tracking-normal normal-case";
  const label =
    "flex flex-col gap-1 text-sm font-bold tracking-widest uppercase";

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="new-meeting-form"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        className="bg-ink text-paper border-ink inline-flex min-h-11 w-full items-center justify-center gap-1.5 border-2 px-4 font-bold tracking-wider whitespace-nowrap uppercase hover:brightness-125 sm:w-auto"
      >
        <Icon icon={Plus} /> New meeting
      </button>

      {open && (
        <div
          id="new-meeting-form"
          role="dialog"
          aria-label="New meeting"
          className="bg-paper border-ink absolute top-full right-0 left-0 z-20 mt-2 flex flex-col gap-3 border-[3px] p-4 shadow-[6px_6px_0_var(--ink)] sm:left-auto sm:w-[22rem]"
        >
          <p className="font-display text-xl leading-none uppercase">
            New meeting
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>
              Date
              <input
                ref={firstField}
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
                className={field}
              />
            </label>
            <label className={label}>
              Time
              <input
                type="time"
                value={time}
                step={300}
                onChange={(e) => {
                  setTime(e.target.value);
                  setError(null);
                }}
                className={field}
              />
            </label>
          </div>
          <dl className="text-slate grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-bold tracking-widest uppercase">Title</dt>
            <dd className="text-ink">{title}</dd>
            <dt className="font-bold tracking-widest uppercase">Points</dt>
            <dd className="text-ink">
              {signInPoints} sign-in · +{demoPoints} demo
            </dd>
          </dl>
          {error && (
            <p role="alert" className="text-bad font-semibold">
              {error.text}
              {error.conflictDate && (
                <>
                  {" · "}
                  <Link
                    href={`/admin/checkin?date=${error.conflictDate}`}
                    onClick={() => setOpen(false)}
                    className="underline underline-offset-4"
                  >
                    Open it
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="flex gap-2 font-bold tracking-wider uppercase">
            <button
              type="button"
              disabled={pending || !date || !time}
              onClick={create}
              className="bg-safety min-h-11 flex-1 border-2 border-[#111] px-4 text-[#111] disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
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
