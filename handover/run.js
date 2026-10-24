// CONTRACT + STUB: one handover cycle. Builder A owns this file and fills in the steps marked TODO.
// export async function runCycle({ reason = "manual", now = new Date() } = {})
//   -> { reason, now, changes: [...], issues: [...], posted: [...], drafts: [...], handovers: [...] }
// Must be safe to call repeatedly and after a restart (every side effect deduped by a marker).
// The listener (handover/listen.js) calls it on startup, after each #drops message, and on a timer; it never runs two at once.
// CLI: node handover/run.js [--now 2026-10-24T19:30:00-05:00]
import fs from "node:fs";
import { update, LEDGER } from "./dispatch.js";
import { applyLedger } from "../kit/linear.js";

export async function runCycle({ reason = "manual", now = new Date() } = {}) {
  const r = await update();
  const ledger = r.full ?? r.ledger ?? JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const issues = await applyLedger(ledger);
  // TODO (builder A): shift transitions + handover notes, owners' AIs finishing ai_can_do work, drafts, Slack posts.
  return { reason, now: now.toISOString(), changes: r.changes ?? [], issues, posted: [], drafts: [], handovers: [] };
}

if (import.meta.filename === process.argv[1]) {
  const { cli } = await import("../kit/env.js");
  cli(async () => {
    const i = process.argv.indexOf("--now");
    const r = await runCycle({ reason: "cli", now: i > 0 ? new Date(process.argv[i + 1]) : new Date() });
    console.log(`cycle (${r.reason}) at ${r.now}: ${r.changes.length} changes, ${r.issues.filter((x) => x.action !== "unchanged").length} issues touched, ${r.posted.length} posts, ${r.drafts.length} drafts, ${r.handovers.length} handovers`);
  });
}
