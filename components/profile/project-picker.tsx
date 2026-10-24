"use client";

import { FolderPen } from "lucide-react";
import { useState, useTransition } from "react";
import { reassignProject } from "@/app/(app)/builders/[id]/actions";
import { Icon } from "@/components/bs/icon";
import { projectKey } from "@/lib/scoring/projects";

const NEW = "__new__";

/**
 * Admin-only "Change project" on a profile update: pick one of the member's
 * existing projects or type a new name. Logged under Decisions as the admin.
 */
export function ProjectPicker({
  messageId,
  current,
  projects,
}: {
  messageId: string;
  current: string | null;
  projects: string[];
}) {
  const others = projects.filter(
    (p) => !current || projectKey(p) !== projectKey(current),
  );
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(others[0] ?? NEW);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = choice === NEW ? typed.trim() : choice;

  const button =
    "border-ink min-h-8 border-2 px-2 text-xs font-bold tracking-wider uppercase disabled:opacity-50";

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className={`${button} text-ink hover:border-rust hover:text-rust ml-auto`}
        title="Admins: move this update to another project"
      >
        <Icon icon={FolderPen} className="mr-1" />
        Change project
      </button>
    );

  return (
    <form
      className="bg-concrete border-ink mt-1 flex w-full flex-wrap items-center gap-2 border-2 p-2 font-normal"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await reassignProject(messageId, name);
          if (res.ok) setOpen(false);
          setError(res.ok ? null : res.error);
        });
      }}
    >
      <fieldset className="contents" disabled={pending}>
        <label className="text-ink text-xs font-bold tracking-wider uppercase">
          Move to
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="border-ink bg-paper ml-2 min-h-8 border-2 px-1 text-sm normal-case"
          >
            {others.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={NEW}>+ New project…</option>
          </select>
        </label>
        {choice === NEW && (
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={60}
            placeholder="Project name"
            aria-label="New project name"
            className="border-ink bg-paper min-h-8 min-w-0 flex-1 border-2 px-2 text-sm"
          />
        )}
        <button
          type="submit"
          disabled={!name}
          className={`${button} bg-ink text-paper`}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className={`${button} text-ink hover:bg-paper`}
        >
          Cancel
        </button>
      </fieldset>
      {error && (
        <p className="text-rust w-full text-sm font-semibold">{error}</p>
      )}
    </form>
  );
}
