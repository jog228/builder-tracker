import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAndSaveScores } from "./compute-scores";

// Check-in saves on every tap, so scores recompute after the response is sent,
// and a burst of taps collapses into one run plus at most one follow-up
// (per server instance; the nightly cron catches anything missed).

let running: Promise<void> | null = null;
let again = false;

function run(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await computeAndSaveScores(createAdminClient());
    } while (again);
  })()
    .catch((err) => console.error("[recompute] failed:", err))
    .finally(() => {
      running = null;
    });
  return running;
}

/** Recompute leaderboard snapshots once this request has responded. */
export function scheduleRecompute() {
  after(run);
}
