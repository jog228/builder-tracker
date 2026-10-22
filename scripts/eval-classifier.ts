// Runs the classifier on the hand-labeled eval set and reports accuracy and cost.
// Writes nothing to the database. The labels file holds only message ids, so no
// member messages are committed to git; text is read from Supabase.
// Usage: npm run eval:classifier
import { readFileSync } from "node:fs";
import { CLASSIFIER, costUsd, type Category } from "../lib/scoring/classify";
import {
  classifyMessages,
  loadClassifiable,
  loadKnownProjects,
} from "../lib/scoring/score-messages";
import { UPDATE_MIN_SUBSTANCE } from "../lib/scoring/config";
import { createAdminClient } from "../lib/supabase/admin";

type Label = {
  id: string;
  category: Category;
  substance: 0 | 1 | 2 | 3;
  note?: string;
};

const pct = (n: number, d: number) =>
  d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "n/a";

// Mirrors scoring before any exec review: a shipped candidate counts as
// progress until approved, so it earns points at UPDATE_MIN_SUBSTANCE.
const earnsPoints = (c: Category, s: number) =>
  ((c === "progress_update" || c === "shipped_candidate") &&
    s >= UPDATE_MIN_SUBSTANCE) ||
  c === "help_given";

async function main() {
  const labels: Label[] = JSON.parse(
    readFileSync("evals/message-labels.json", "utf8"),
  ).labels;
  const db = createAdminClient();
  const messages = await loadClassifiable(
    db,
    labels.map((l) => l.id),
  );
  const missing = labels.filter((l) => !messages.some((m) => m.id === l.id));
  if (missing.length) {
    console.warn(
      `Not in database (skipped): ${missing.map((l) => l.id).join(", ")}`,
    );
  }

  // Same context as production: each message sees its author's projects from
  // earlier scored messages.
  const outcome = await classifyMessages(messages, await loadKnownProjects(db));
  const predicted = new Map(outcome.scores.map((s) => [s.message_id, s]));
  const graded = labels.filter((l) => predicted.has(l.id));

  let category = 0;
  let substanceExact = 0;
  let substanceNear = 0;
  let points = 0;
  const rows = [];
  for (const l of graded) {
    const p = predicted.get(l.id)!;
    const catOk = p.category === l.category;
    category += +catOk;
    substanceExact += +(p.substance === l.substance);
    substanceNear += +(Math.abs(p.substance - l.substance) <= 1);
    points += +(
      earnsPoints(p.category, p.substance) ===
      earnsPoints(l.category, l.substance)
    );
    if (!catOk || p.substance !== l.substance) {
      rows.push({
        id: l.id,
        expected: `${l.category}/${l.substance}`,
        got: `${p.category}/${p.substance}`,
        summary: p.summary,
      });
    }
  }

  if (rows.length) {
    console.log("\nDisagreements:");
    console.table(rows);
  }
  const cost = costUsd(outcome.usage);
  console.log(`
model:              ${CLASSIFIER.model} (effort ${CLASSIFIER.effort})
graded:             ${graded.length}/${labels.length}${outcome.failed.length ? ` (${outcome.failed.length} failed: ${[...new Set(outcome.failed.map((f) => f.error))].join("; ")})` : ""}
category accuracy:  ${pct(category, graded.length)}   (target ≥ 80%)
substance exact:    ${pct(substanceExact, graded.length)}
substance ±1:       ${pct(substanceNear, graded.length)}
earns-points agree: ${pct(points, graded.length)}
tokens:             ${outcome.usage.input} in / ${outcome.usage.output} out
cost:               $${cost.toFixed(5)} ($${graded.length ? ((cost / graded.length) * 1000).toFixed(3) : "-"} per 1,000 messages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
