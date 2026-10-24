// CONTRACT: scenario plug-ins (one file per scenario from artifacts/Zapdos_efficiency_this_week_anonymized_2026-10-24.pdf).
// runScenarios(ctx) loads every handover/scenarios/<id>.js except this file and runs each one in turn. Each is isolated:
// one scenario throwing never breaks the cycle. runCycle (handover/run.js) calls it after the generic AI work.
//
// A scenario module exports:
//   export const id = "factory-install";          // kebab id = file name
//   export const scenario = 1;                     // row number in the PDF
//   export async function run(ctx) -> [{ type: "linear" | "slack" | "draft", what, link, held?: true }]
//
// ctx (built by buildContext below, or handed in by runCycle):
//   ledger                  state/ledger.json { obligations, conflicts, linear_fixes, source_refs }
//   open                    open obligations (status != done) that have a Linear issue
//   issueOf[key]            { identifier, url } of the obligation's Linear issue
//   info[key]               { id, comments: [{ body, url, createdAt }] } (linearIssue() from work.js)
//   byRef[ref], sources     citable source items (handover/sources.js)
//   now, simulated, mode    clock; mode = "sim" | "live" (put it in Slack markers like run.js does)
//   note(personId)          "(simulated clock: ...)" suffix or ""
//   onShift(personId)       bool
//   dry                     true -> make NO side effects (no Slack, Linear, drafts, email); return what you WOULD do, with link: "(dry)"
//
// Rules for every scenario:
//   - Idempotent: dedupe every side effect through the tool (Linear `marker:` line via comment(); Slack marker via say()/findMessage).
//     A second cycle must produce 0 new effects.
//   - Honest: only facts from cited sources. Run work.js honesty() on any date / $ / address you write. If it fails, post a
//     "held back: a human should do this" comment instead (see doWork). If the pack lacks something (pricing rules, receipts, a
//     config file), say so plainly in the output. Never invent it.
//   - Everything a person sees is labelled AI (say()/postAs() add the persona signature).
//   - Anything that goes OUT (email/WhatsApp) becomes a draft (drafts.js addDraft + a Slack post with [draft:<id>]) for ✅.
//     Never send directly.
//   - At most 2 Claude calls per cycle per scenario (askJSON effort "low"). Skip the call entirely once the marker exists.
//   - Act only for owners who are on shift, unless the scenario says otherwise.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

export async function runScenarios(ctx) {
  const out = [];
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && f !== "index.js").sort();
  for (const f of files) {
    try {
      const m = await import(pathToFileURL(path.join(DIR, f)).href);
      if (typeof m.run !== "function") continue;
      for (const e of (await m.run(ctx)) ?? []) out.push({ ...e, what: `[scenario ${m.scenario ?? "?"} ${m.id ?? f}] ${e.what}` });
    } catch (e) {
      out.push({ type: "error", what: `[scenario ${f}] failed: ${e.message}`, link: "" });
    }
  }
  return out;
}

// Ledger keys are written by the model and change between rebuilds ("weilin-reimbursement" vs "reimburse-weilin").
// The work pack's Linear ids are stable, so scenarios resolve their obligation from the pack id. Falls back to `fallback`.
export const keyFor = (ctx, packId, fallback) =>
  ctx.ledger.obligations.find((o) => o.linear_ids?.[0] === packId)?.key ?? ctx.ledger.obligations.find((o) => o.linear_ids?.includes(packId))?.key ?? fallback;

// For a scenario's own CLI (`node handover/scenarios/<id>.js [--dry] [--now ISO]`): builds the same ctx runCycle would,
// without running the dispatcher or any other step.
export async function buildContext({ now, dry = false } = {}) {
  const { applyLedger } = await import("../../kit/linear.js");
  const { LEDGER } = await import("../dispatch.js");
  const { loadSources } = await import("../sources.js");
  const { linearIssue, pool } = await import("../work.js");
  const { PERSONAS } = await import("../personas.js");
  const { local } = await import("../shift.js");
  const simulated = !!now && Math.abs(now - Date.now()) > 2 * 60 * 1000;
  now ??= new Date();
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const issues = await applyLedger(ledger); // idempotent: normally 0 changes
  const issueOf = Object.fromEntries(issues.map((i) => [i.key, i]));
  const open = ledger.obligations.filter((o) => o.status !== "done" && issueOf[o.key]);
  const info = {};
  await pool(open, 4, async (o) => (info[o.key] = await linearIssue(issueOf[o.key].identifier)));
  const sources = loadSources(), byRef = Object.fromEntries(sources.map((s) => [s.ref, s]));
  const onShift = (pid) => { const h = local(now, PERSONAS[pid].tz).hour; return h >= 8 && h < 20; };
  const note = (pid) => (simulated ? `\n_(simulated clock: ${local(now, PERSONAS[pid].tz).label})_` : "");
  return { ledger, open, issueOf, info, byRef, sources, now, simulated, mode: simulated ? "sim" : "live", note, onShift, dry };
}

// Shared CLI for scenario files: if (import.meta.filename === process.argv[1]) await scenarioCli(run);
export async function scenarioCli(run) {
  const { cli } = await import("../../kit/env.js");
  await cli(async () => {
    const i = process.argv.indexOf("--now");
    const ctx = await buildContext({ now: i > 0 ? new Date(process.argv[i + 1]) : undefined, dry: process.argv.includes("--dry") });
    const effects = (await run(ctx)) ?? [];
    for (const e of effects) console.log(`${ctx.dry ? "(dry) " : "+ "}${e.type}: ${e.what}${e.held ? " [HELD BACK]" : ""} ${e.link ?? ""}`);
    console.log(`${effects.length} effect(s)${ctx.dry ? " planned (dry run, nothing written)" : ""}`);
  });
}
