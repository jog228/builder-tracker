"use client";

import {
  Check,
  MonitorPlay,
  TriangleAlert,
  Undo2,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { setCheckin } from "@/app/(app)/admin/checkin/actions";
import { MemberAvatar } from "@/components/bs/avatar";
import { Icon } from "@/components/bs/icon";
import type { CheckinTarget } from "@/lib/attendance/checkin";
import type { SheetMember } from "@/lib/data/checkin";
import { dayLabel } from "@/lib/format";
import { localDate } from "@/lib/scoring/time";
import { cn } from "@/lib/utils";

type Row = Pick<SheetMember, "present" | "demo" | "recordedBy" | "recordedAt">;
type Toast =
  | {
      kind: "undo";
      id: string;
      name: string;
      text: string;
      icon: LucideIcon;
      prev: CheckinTarget;
    }
  | { kind: "error"; text: string };

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/** Week dropdown; navigates on change. */
export function WeekSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; href: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <>
      <label className="sr-only" htmlFor="week">
        Meeting week
      </label>
      <select
        id="week"
        value={value}
        onChange={(e) =>
          router.push(options.find((o) => o.value === e.target.value)!.href)
        }
        className="border-ink bg-paper min-h-11 min-w-0 flex-1 border-2 px-2 text-base font-bold uppercase"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

/** "Crew sign-in" sheet: tap to sign in, Demo for a demo, saves instantly. */
export function CheckinSheet({
  eventId,
  eventDate,
  members,
  recorders,
  hiddenExecs,
  demoPoints,
}: {
  eventId: string;
  /** The meeting's date; back-filled entries also show when they were entered. */
  eventDate: string;
  members: SheetMember[];
  recorders: Record<string, string>;
  hiddenExecs: number;
  demoPoints: number;
}) {
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m])),
  );
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(0);
  // One save chain per member, so fast double-taps land in order.
  const chains = useRef(new Map<string, Promise<void>>());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const present = Object.values(rows).filter((r) => r.present).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? members.filter((m) => m.name.toLowerCase().includes(q))
      : members;
  }, [members, query]);

  function showToast(t: Toast) {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  function apply(m: SheetMember, target: CheckinTarget, undoable: boolean) {
    const prev = rows[m.id];
    const prevTarget = { present: prev.present, demo: prev.demo };
    // Optimistic: a demo implies present; leaving also drops the demo.
    const next = { present: target.present || target.demo, demo: target.demo };
    setRows((r) => ({ ...r, [m.id]: { ...r[m.id], ...next } }));
    if (undoable) {
      const [icon, text]: [LucideIcon, string] =
        next.demo && !prev.demo
          ? [MonitorPlay, `${m.name} demoed (+${demoPoints})`]
          : next.present && !prev.present
            ? [Check, `${m.name} signed in`]
            : !next.present && prev.present
              ? [
                  UserMinus,
                  `${m.name} removed${prev.demo ? " (demo revoked)" : ""}`,
                ]
              : [MonitorPlay, `${m.name}: demo removed`];
      showToast({
        kind: "undo",
        id: m.id,
        name: m.name,
        text,
        icon,
        prev: prevTarget,
      });
    }

    setSaving((n) => n + 1);
    const chain = (chains.current.get(m.id) ?? Promise.resolve()).then(
      async () => {
        try {
          const res = await setCheckin(eventId, m.id, next);
          if (res.ok) {
            setRows((r) => ({
              ...r,
              [m.id]: {
                present: res.row.present,
                demo: !!res.row.demoId,
                recordedBy: res.row.recordedBy,
                recordedAt: res.row.recordedAt,
              },
            }));
          } else {
            setRows((r) => ({ ...r, [m.id]: prev }));
            showToast({ kind: "error", text: res.error });
          }
        } catch {
          setRows((r) => ({ ...r, [m.id]: prev }));
          showToast({
            kind: "error",
            text: `Couldn't save ${m.name}. Check your connection.`,
          });
        } finally {
          setSaving((n) => n - 1);
        }
      },
    );
    chains.current.set(m.id, chain);
  }

  return (
    <section className="bg-paper border-ink border-[3px]">
      {/* Sticky tally + search: stays in reach while scrolling on a phone. */}
      <div className="bg-paper border-ink sticky top-0 z-10 flex flex-col gap-3 border-b-[3px] p-3 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-5xl leading-none tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {present}
            <span className="sr-only"> present</span>
          </span>
          <span className="font-bold tracking-[0.12em] uppercase">
            present
            <span className="text-slate block text-sm font-semibold tracking-wider normal-case">
              of {members.length} builders
              {hiddenExecs > 0 && ` · ${hiddenExecs} exec hidden`}
              {saving > 0 ? " · saving…" : " · saved"}
            </span>
          </span>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold tracking-widest uppercase sm:w-72">
          Find a builder
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name"
            autoComplete="off"
            className="border-ink placeholder:text-slate min-h-12 w-full border-2 bg-white px-3 text-lg font-normal tracking-normal normal-case"
          />
        </label>
      </div>

      <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-5 lg:grid-cols-4">
        {visible.map((m) => {
          const r = rows[m.id];
          const by = r.recordedBy ? recorders[r.recordedBy] : null;
          return (
            <li
              key={m.id}
              className={cn(
                "border-ink relative flex flex-col border-2 transition-colors",
                r.present ? "bg-safety" : "bg-white",
              )}
            >
              <button
                type="button"
                aria-pressed={r.present}
                onClick={() =>
                  apply(
                    m,
                    { present: !r.present, demo: r.present ? false : r.demo },
                    true,
                  )
                }
                className="flex min-h-[112px] flex-1 flex-col items-center gap-1.5 px-2 pt-3 pb-2 text-center"
              >
                <MemberAvatar name={m.name} url={m.avatarUrl} size={52} />
                <span className="line-clamp-2 leading-tight font-bold break-words">
                  {m.name}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-bold tracking-[0.14em] uppercase",
                    !r.present && "text-slate",
                  )}
                >
                  {r.present && <Icon icon={Check} />}
                  {r.present ? "Signed in" : "Tap to sign in"}
                </span>
                {r.present && r.recordedAt && (
                  <span className="text-[0.72rem] leading-tight text-[#111]/70">
                    {by ? `by ${by.split(" ")[0]} · ` : ""}
                    {localDate(r.recordedAt) === eventDate
                      ? timeFmt.format(new Date(r.recordedAt))
                      : `entered ${dayLabel(r.recordedAt)}`}
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-pressed={r.demo}
                aria-label={`${r.demo ? "Remove" : "Add"} demo for ${m.name}`}
                onClick={() => apply(m, { present: true, demo: !r.demo }, true)}
                className={cn(
                  "border-ink inline-flex min-h-11 items-center justify-center gap-1.5 border-t-2 text-sm font-bold tracking-[0.1em] uppercase",
                  r.demo ? "bg-ink text-safety" : "hover:bg-concrete",
                )}
              >
                <Icon icon={MonitorPlay} />
                {r.demo ? `Demoed +${demoPoints}` : "Demo"}
              </button>
            </li>
          );
        })}
      </ul>
      {!visible.length && (
        <p className="text-slate px-4 pb-8 text-center text-lg">
          No builder matches “{query}”.
        </p>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={reduce ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            className={cn(
              "fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-md items-center gap-3 border-2 border-[#111] px-4 py-3 shadow-[6px_6px_0_var(--ink)]",
              toast.kind === "error"
                ? "bg-bad text-paper"
                : "bg-ink text-paper",
            )}
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <Icon
              icon={toast.kind === "error" ? TriangleAlert : toast.icon}
              className={cn("text-xl", toast.kind === "undo" && "text-safety")}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {toast.text}
            </span>
            {toast.kind === "undo" && (
              <button
                type="button"
                onClick={() => {
                  const m = members.find((x) => x.id === toast.id)!;
                  setToast(null);
                  apply(m, toast.prev, false);
                }}
                className="bg-safety inline-flex min-h-10 shrink-0 items-center gap-1.5 border-2 border-[#111] px-4 font-bold tracking-[0.1em] text-[#111] uppercase"
              >
                <Icon icon={Undo2} />
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
