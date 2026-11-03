"use client";

import Link from "next/link";
import { Check, ChevronDown, Mail, UserPlus, Users, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  cancelTeammateRequest,
  removeTeammate,
  requestTeammate,
  resendTeammateInvite,
  respondTeammate,
} from "@/app/(app)/teammates/actions";
import { Combobox } from "@base-ui/react/combobox";
import { MemberAvatar } from "@/components/bs/avatar";
import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import { Icon } from "@/components/bs/icon";
import {
  choiceAfterTyping,
  filterBuilders,
  pickedBuilder,
} from "@/lib/teammates/picker";
import {
  PROJECT_MAX_CHARS,
  type TeammateLists,
  type TeammateMember,
} from "@/lib/teammates/rules";
import { cn } from "@/lib/utils";

const small =
  "border-ink inline-flex min-h-9 items-center gap-1.5 border-2 px-2.5 text-sm font-bold tracking-wider whitespace-nowrap uppercase disabled:opacity-50";

type Note = { ok: boolean; text: string } | null;

/**
 * "Teammates" card, full width under "Now building". Everyone (guests too)
 * sees confirmed teammates. The profile's owner also gets, top to bottom: the
 * add row (roster picker + optional project), Remove on each teammate,
 * incoming requests (Accept / Decline) and their own pending ones ("Waiting
 * on them": Resend if the email failed, Uninvite).
 */
export function Teammates({
  lists,
  candidates,
  isOwner,
}: {
  lists: TeammateLists;
  /** Roster picker options; loaded only for the owner (null otherwise). */
  candidates: TeammateMember[] | null;
  isOwner: boolean;
}) {
  const [note, setNote] = useState<Note>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Note>) =>
    start(async () => setNote(await fn()));
  const { confirmed, incoming, outgoing } = lists;

  return (
    <Card>
      <SectionTitle hint={confirmed.length ? `${confirmed.length}` : undefined}>
        Teammates
      </SectionTitle>

      {isOwner && candidates && <AddRow candidates={candidates} />}

      {confirmed.length ? (
        <ul className="flex flex-col gap-2">
          {confirmed.map((t) => (
            <Row key={t.linkId} member={t.member} project={t.project}>
              {isOwner && (
                <ConfirmButton
                  label="Remove"
                  question={`Remove ${firstName(t.member.name)}?`}
                  yes="Yes, remove"
                  busy="Removing…"
                  act={() => removeTeammate(t.linkId)}
                />
              )}
            </Row>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Users}>
          {isOwner
            ? "No teammates yet. Add the people you build with."
            : "No teammates yet."}
        </EmptyState>
      )}

      {isOwner && incoming.length > 0 && (
        <Group title="Asked to team up with you">
          {incoming.map((t) => (
            <Row key={t.linkId} member={t.member} project={t.project}>
              <button
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await respondTeammate(t.linkId, true);
                    return r.ok
                      ? {
                          ok: true,
                          text: `You and ${t.member.name} are teammates.`,
                        }
                      : { ok: false, text: r.error };
                  })
                }
                className={cn(small, "bg-safety border-[#111] text-[#111]")}
              >
                <Icon icon={Check} /> Accept
              </button>
              <button
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await respondTeammate(t.linkId, false);
                    return r.ok ? null : { ok: false, text: r.error };
                  })
                }
                className={cn(small, "text-ink hover:bg-concrete")}
              >
                <Icon icon={X} /> Decline
              </button>
            </Row>
          ))}
        </Group>
      )}

      {isOwner && outgoing.length > 0 && (
        <Group title="Waiting on them">
          {outgoing.map((t) => (
            <Row key={t.linkId} member={t.member} project={t.project}>
              <span className="border-dash text-slate border-2 border-dashed px-2 text-sm font-bold tracking-wider whitespace-nowrap uppercase">
                Pending
              </span>
              {t.emailFailed && (
                <>
                  <span className="text-rust text-sm font-semibold whitespace-nowrap">
                    Email didn&rsquo;t send
                  </span>
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const r = await resendTeammateInvite(t.linkId);
                        return r.ok
                          ? {
                              ok: true,
                              text: `Sent ${t.member.name} the email.`,
                            }
                          : { ok: false, text: r.error };
                      })
                    }
                    className={cn(small, "text-ink hover:bg-concrete")}
                  >
                    <Icon icon={Mail} /> Resend
                  </button>
                </>
              )}
              <ConfirmButton
                label="Uninvite"
                question={`Uninvite ${firstName(t.member.name)}?`}
                yes="Yes, uninvite"
                busy="Cancelling…"
                act={() => cancelTeammateRequest(t.linkId)}
              />
            </Row>
          ))}
        </Group>
      )}

      <NoteLine note={note} />
    </Card>
  );
}

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p
      role={note.ok ? "status" : "alert"}
      className={cn("mt-3 font-semibold", note.ok ? "text-ok" : "text-bad")}
    >
      {note.text}
    </p>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="mb-2 text-sm font-bold tracking-widest uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

const firstName = (name: string) => name.split(" ")[0];

function Row({
  member,
  project,
  children,
}: {
  member: TeammateMember;
  project?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link
        href={`/builders/${member.id}`}
        className="hover:text-rust flex min-w-0 flex-1 items-center gap-2.5 text-lg font-semibold"
      >
        <MemberAvatar name={member.name} url={member.avatarUrl} size={36} />
        {/* Full name on wider screens; phones truncate. */}
        <span className="truncate sm:whitespace-normal">
          {member.name}
          {project && (
            <span className="text-slate font-normal">
              {" · "}Project: {project}
            </span>
          )}
        </span>
      </Link>
      {/* Badges and buttons stay on one line at the right; they wrap only
          when the row is too narrow for them (phones). */}
      {children && (
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {children}
        </span>
      )}
    </li>
  );
}

/** A small button that asks first ("Remove" / "Uninvite"), then runs `act`. */
function ConfirmButton({
  label,
  question,
  yes,
  busy,
  act,
}: {
  label: string;
  question: string;
  yes: string;
  busy: string;
  act: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button
        onClick={() => setAsking(true)}
        className={cn(small, "text-slate hover:text-rust hover:border-rust")}
      >
        {label}
      </button>
    );
  return (
    <>
      <span className="text-sm font-semibold whitespace-nowrap">
        {question}
      </span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await act();
            if (!r.ok) setError(r.error);
          })
        }
        className={cn(small, "bg-ink text-paper")}
      >
        {pending ? busy : yes}
      </button>
      <button
        disabled={pending}
        onClick={() => setAsking(false)}
        className={cn(small, "text-ink hover:bg-concrete")}
      >
        Keep
      </button>
      {error && <span className="text-bad text-sm font-semibold">{error}</span>}
    </>
  );
}

/**
 * The owner's "Add a teammate" row at the top of the card: pick someone from
 * the roster, optionally name the project, Add. One row on wider screens;
 * stacked on phones. Hidden when there's nobody left to add.
 */
function AddRow({ candidates }: { candidates: TeammateMember[] }) {
  const [selected, setSelected] = useState<TeammateMember | null>(null);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [note, setNote] = useState<Note>(null);
  const [pending, start] = useTransition();
  if (!candidates.length) return null;
  // Only a real roster option enables Add; free text never does.
  const picked = pickedBuilder(candidates, selected);
  const field = "border-ink bg-paper min-h-10 min-w-0 border-2 text-lg";

  return (
    <form
      className="border-dash mb-4 flex flex-col gap-2 border-b-2 border-dashed pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked) return;
        start(async () => {
          const r = await requestTeammate(picked.id, project);
          if (r.ok) {
            setSelected(null);
            setQuery("");
            setProject("");
          }
          setNote(
            !r.ok
              ? { ok: false, text: r.error }
              : r.status === "confirmed"
                ? {
                    ok: true,
                    text: `${picked.name} had already added you, so you're teammates now.`,
                  }
                : r.emailSent
                  ? {
                      ok: true,
                      text: `Request sent. ${picked.name} got an email to confirm.`,
                    }
                  : {
                      ok: false,
                      text: `Request saved, but the email to ${picked.name} didn't send. Use Resend below.`,
                    },
          );
        });
      }}
    >
      <label
        htmlFor="add-teammate"
        className="text-sm font-bold tracking-widest uppercase"
      >
        Add a teammate
      </label>
      {/* One row from sm up (flex items stretch, so all three share a
          height); stacked on phones. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <BuilderCombobox
          id="add-teammate"
          className={field}
          candidates={candidates}
          selected={selected}
          query={query}
          disabled={pending}
          onSelect={setSelected}
          onQuery={setQuery}
        />
        <label htmlFor="teammate-project" className="sr-only">
          Project (optional)
        </label>
        <input
          id="teammate-project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          disabled={pending}
          maxLength={PROJECT_MAX_CHARS}
          placeholder="Project (optional)"
          autoComplete="off"
          className={cn(field, "px-2 sm:flex-1")}
        />
        <button
          type="submit"
          disabled={!picked || pending}
          className={cn(
            small,
            "bg-ink text-paper min-h-10 justify-center px-4",
          )}
        >
          <Icon icon={UserPlus} /> {pending ? "Sending…" : "Add"}
        </button>
      </div>
      <NoteLine note={note} />
    </form>
  );
}

/**
 * Searchable roster picker (Base UI Combobox: role="combobox" input,
 * aria-expanded / aria-controls / aria-activedescendant, listbox + option
 * roles, arrow keys, Enter, Escape, touch). Type to filter (case and accents
 * ignored, anywhere in the name); click or focus opens the full list. The
 * list is portaled to <body>, so the card never clips it. Filtering and the
 * "typing drops the choice" rule live in lib/teammates/picker.ts.
 */
function BuilderCombobox({
  id,
  className,
  candidates,
  selected,
  query,
  disabled,
  onSelect,
  onQuery,
}: {
  id: string;
  className: string;
  candidates: TeammateMember[];
  selected: TeammateMember | null;
  query: string;
  disabled: boolean;
  onSelect: (m: TeammateMember | null) => void;
  onQuery: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Combobox.Root<TeammateMember>
      items={candidates}
      filteredItems={filterBuilders(candidates, query, selected)}
      value={selected}
      onValueChange={(m) => onSelect(m)}
      inputValue={query}
      onInputValueChange={(typed, details) => {
        onQuery(typed);
        if (details.reason === "input-change")
          onSelect(choiceAfterTyping(selected, typed));
      }}
      open={open}
      onOpenChange={setOpen}
      itemToStringLabel={(m) => m.name}
      itemToStringValue={(m) => m.id}
      isItemEqualToValue={(a, b) => a.id === b.id}
      autoHighlight
      disabled={disabled}
    >
      {/* Chevron 12px from the right like the check-in WeekSelect; pr-10
          keeps the text clear of it. Clicks pass through it to the input. */}
      <div className="relative flex min-w-0 sm:flex-[1.2]">
        <Combobox.Input
          id={id}
          placeholder="Pick a builder…"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          className={cn(className, "w-full pr-10 pl-2")}
        />
        <Icon
          icon={ChevronDown}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-lg"
        />
      </div>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={4}
          className="z-50 outline-none"
        >
          <Combobox.Popup className="border-ink bg-paper text-ink w-[var(--anchor-width)] max-w-[var(--available-width)] border-2 shadow-[4px_4px_0_var(--ink)]">
            <Combobox.Empty className="text-slate px-3 py-2 text-lg empty:hidden">
              No builders match
            </Combobox.Empty>
            {/* ~6 options visible (44px each), then it scrolls. */}
            <Combobox.List className="max-h-[min(16.5rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none data-empty:hidden">
              {(m: TeammateMember) => (
                <Combobox.Item
                  key={m.id}
                  value={m}
                  className="data-highlighted:bg-concrete data-selected:text-rust flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-lg font-semibold select-none"
                >
                  <MemberAvatar name={m.name} url={m.avatarUrl} size={28} />
                  <span className="min-w-0 truncate">{m.name}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
