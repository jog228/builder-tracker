"use client";

import Link from "next/link";
import { Check, Mail, UserPlus, Users, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  removeTeammate,
  requestTeammate,
  resendTeammateInvite,
  respondTeammate,
} from "@/app/(app)/teammates/actions";
import { MemberAvatar } from "@/components/bs/avatar";
import { Card, EmptyState, SectionTitle } from "@/components/bs/bits";
import { Icon } from "@/components/bs/icon";
import type { TeammateLists, TeammateMember } from "@/lib/teammates/rules";
import { cn } from "@/lib/utils";

const small =
  "border-ink inline-flex min-h-9 items-center gap-1.5 border-2 px-2.5 text-sm font-bold tracking-wider uppercase disabled:opacity-50";

type Note = { ok: boolean; text: string } | null;

/**
 * "Teammates" card. Everyone sees confirmed teammates; the profile's owner
 * also adds people (roster only), answers requests, sees their pending ones
 * (with "Resend" if the email failed) and removes teammates.
 */
export function Teammates({
  lists,
  candidates,
  isOwner,
}: {
  lists: TeammateLists;
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

      {isOwner && incoming.length > 0 && (
        <Group title="Asked to team up with you">
          {incoming.map((t) => (
            <Row key={t.linkId} member={t.member}>
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

      {confirmed.length ? (
        <ul className="flex flex-col gap-2">
          {confirmed.map((t) => (
            <Row key={t.linkId} member={t.member}>
              {isOwner && (
                <RemoveButton linkId={t.linkId} name={t.member.name} />
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

      {isOwner && outgoing.length > 0 && (
        <Group title="Waiting on them">
          {outgoing.map((t) => (
            <Row key={t.linkId} member={t.member}>
              <span className="border-dash text-slate border-2 border-dashed px-2 text-sm font-bold tracking-wider uppercase">
                Pending
              </span>
              {t.emailFailed && (
                <>
                  <span className="text-rust text-sm font-semibold">
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
            </Row>
          ))}
        </Group>
      )}

      {isOwner && candidates && (
        <AddTeammate
          candidates={candidates}
          disabled={pending}
          onDone={setNote}
        />
      )}

      {note && (
        <p
          role={note.ok ? "status" : "alert"}
          className={cn("mt-3 font-semibold", note.ok ? "text-ok" : "text-bad")}
        >
          {note.text}
        </p>
      )}
    </Card>
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

function Row({
  member,
  children,
}: {
  member: TeammateMember;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link
        href={`/builders/${member.id}`}
        className="hover:text-rust flex min-w-0 flex-1 items-center gap-2.5 text-lg font-semibold"
      >
        <MemberAvatar name={member.name} url={member.avatarUrl} size={36} />
        <span className="truncate">{member.name}</span>
      </Link>
      {children && (
        <span className="flex flex-wrap items-center gap-2">{children}</span>
      )}
    </li>
  );
}

function RemoveButton({ linkId, name }: { linkId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button
        onClick={() => setAsking(true)}
        className={cn(small, "text-slate hover:text-rust hover:border-rust")}
      >
        Remove
      </button>
    );
  return (
    <>
      <span className="text-sm font-semibold">
        Remove {name.split(" ")[0]}?
      </span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await removeTeammate(linkId);
            if (!r.ok) setError(r.error);
          })
        }
        className={cn(small, "bg-ink text-paper")}
      >
        {pending ? "Removing…" : "Yes, remove"}
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

function AddTeammate({
  candidates,
  disabled,
  onDone,
}: {
  candidates: TeammateMember[];
  disabled: boolean;
  onDone: (note: Note) => void;
}) {
  const [choice, setChoice] = useState("");
  const [pending, start] = useTransition();
  if (!candidates.length) return null;
  const picked = candidates.find((c) => c.id === choice);

  return (
    <form
      className="bg-concrete border-ink mt-4 flex flex-wrap items-center gap-2 border-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked) return;
        start(async () => {
          const r = await requestTeammate(picked.id);
          if (r.ok) setChoice("");
          onDone(
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
      <select
        id="add-teammate"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        disabled={pending || disabled}
        className="border-ink bg-paper min-h-10 min-w-0 flex-1 border-2 px-2 text-lg"
      >
        <option value="">Pick a builder…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!picked || pending || disabled}
        className={cn(small, "bg-ink text-paper min-h-10")}
      >
        <Icon icon={UserPlus} /> {pending ? "Sending…" : "Add"}
      </button>
    </form>
  );
}
