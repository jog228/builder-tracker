import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { computeAndSaveScores } from "@/lib/scoring/compute-scores";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handler(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await computeAndSaveScores(createAdminClient());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron sends GET; POST is for manual triggers.
export { handler as GET, handler as POST };
