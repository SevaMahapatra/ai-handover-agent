// CONTRACT + STUB: one handover cycle. Builder A owns this file and fills in the steps marked TODO.
// export async function runCycle({ reason = "manual", now = new Date() } = {})
//   -> { reason, now, changes: [...], issues: [...], posted: [...], drafts: [...], handovers: [...] }
//      (+ comments: [...] new Linear comments, flags: [...] honesty flags, transitions: [...])
// Must be safe to call repeatedly and after a restart (every side effect deduped by a marker).
// The listener (handover/listen.js) calls it on startup, after each #drops message, and on a timer; it never runs two at once.
// CLI: node handover/run.js [--now 2026-10-24T19:30:00-05:00]
// Cycle: shifts -> handover notes for people going OFF -> owners' AIs do ai_can_do work -> pick-up posts for people coming ON -> asks for human-only items.
import fs from "node:fs";
import { z } from "zod";
import { update, LEDGER } from "./dispatch.js";
import { applyLedger, comment } from "../kit/linear.js";
import { askJSON } from "../vision/claude.js";
import { PERSONAS } from "./personas.js";
import { loadSources } from "./sources.js";
import { shiftChanges, local } from "./shift.js";
import { doWork, linearIssue, say, pool, link, honesty, citedText, workMarker } from "./work.js";

const MAX_WORK_PER_PERSON = 6; // per cycle, keeps a demo cycle fast
const first = (name) => PERSONAS[name].name.split(" ")[0] === "Wei" ? "Wei Lin" : PERSONAS[name].name.split(" ")[0];
const byDue = (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999");

const Done = z.object({ items: z.array(z.object({ key: z.string(), done: z.string(), refs: z.array(z.string()) })) });
async function doneNotes(obls, byRef) {
  const text = obls.map((o) => `## ${o.key}: ${o.title}\nNext step: ${o.next_step}\nSources:\n${citedText(o.sources, byRef)}`).join("\n\n");
  const r = await askJSON({ effort: "low", schema: Done, max_tokens: 6000,
    system: "For each obligation, say in one or two short lines what the sources show is already DONE (who did what), citing refs. Only facts written in the sources. If nothing is done yet, say \"Nothing done yet per the sources.\"",
    content: [{ type: "text", text }] });
  return Object.fromEntries(r.items.map((i) => [i.key, i]));
}

export async function runCycle({ reason = "manual", now = new Date() } = {}) {
  const r = await update();
  const ledger = r.full ?? r.ledger ?? JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const issues = await applyLedger(ledger);

  const shifts = shiftChanges(now);
  const simulated = Math.abs(now - Date.now()) > 2 * 60 * 1000;
  const clock = (pid) => local(now, PERSONAS[pid].tz).label;
  const note = (pid) => (simulated ? `\n_(simulated clock: ${clock(pid)})_` : "");
  const onShift = (pid) => shifts.state[pid]?.onShift;
  const sources = loadSources(), byRef = Object.fromEntries(sources.map((s) => [s.ref, s]));
  const issueOf = Object.fromEntries(issues.map((i) => [i.key, i]));
  const open = ledger.obligations.filter((o) => o.status !== "done" && issueOf[o.key]).sort(byDue);
  const info = {};
  await pool(open, 4, async (o) => (info[o.key] = await linearIssue(issueOf[o.key].identifier)));
  const out = { posted: [], drafts: [], handovers: [], comments: [], flags: [] };
  const slack = (what, s) => !s.existed && out.posted.push({ type: "slack", what, link: s.permalink });

  // 2. HANDOVER: a person goes off shift -> a done/next/why note on each open issue + one summary in #handover.
  for (const t of shifts.transitions.filter((t) => t.to === "off")) {
    const p = PERSONAS[t.personId], mine = open.filter((o) => o.owner === t.personId);
    const mark = (o) => `handover:${o.key}:${t.personId}:${t.date}`;
    const missing = mine.filter((o) => !info[o.key].comments.some((c) => c.body.includes(mark(o))));
    const done = missing.length ? await doneNotes(missing, byRef) : {};
    for (const o of missing) {
      let d = done[o.key] ?? { done: "Nothing done yet per the sources.", refs: [] };
      const flags = honesty(`handover ${o.key}`, d.done, [], citedText(o.sources, byRef));
      if (flags.length) (out.flags.push(...flags), (d = { done: "(held back: the summary failed the honesty check)", refs: [] }));
      const ai = info[o.key].comments.filter((c) => /did this:|drafted an email/.test(c.body)).map((c) => c.url);
      const body = [`**Handover from ${p.aiName}** at ${clock(t.personId)}${simulated ? " (simulated clock)" : ""}`,
        `**Done:** ${d.done}${d.refs.length ? ` (${d.refs.join(", ")})` : ""}${ai.length ? `\nAI work on this issue: ${ai.join(" ")}` : ""}`,
        `**Next:** ${o.next_step}`, `**Why:** ${o.why}`, `**Waiting on:** ${o.needs_human ?? o.owed_to}`, `**Due:** ${o.due ?? "no date in the sources"}`,
        `marker: ${mark(o)}`].join("\n\n");
      const c = await comment(info[o.key].id, body);
      out.handovers.push({ personId: t.personId, key: o.key, what: `${issueOf[o.key].identifier} handover note`, link: c.url });
    }
    if (mine.length) {
      const lines = mine.map((o) => `• ${link(issueOf[o.key])} ${o.title}. Next: ${o.next_step}`).join("\n");
      slack(`handover summary ${t.personId}`, await say(t.personId, `*${first(t.personId)} is off shift.* Handover notes are on each Linear issue (done / next / why):\n${lines}`, `[handover:${t.personId}:${t.date}]`, note(t.personId)));
    }
  }

  // 4. DO THE WORK: every on-shift owner's AI finishes its ai_can_do items, once each (marker on the Linear issue).
  const todo = {};
  for (const o of open.filter((o) => o.ai_can_do && onShift(o.owner))) (todo[o.owner] ??= []).push(o);
  const batch = Object.values(todo).flatMap((list) => {
    const fresh = list.filter((o) => !info[o.key].comments.some((c) => c.body.includes(workMarker(o))));
    return [...list.filter((o) => !fresh.includes(o)), ...fresh.slice(0, MAX_WORK_PER_PERSON)]; // done ones only restore drafts
  });
  const didNow = {};
  await pool(batch, 3, async (o) => {
    const w = await doWork(o, info[o.key], byRef, ledger.conflicts ?? [], note(o.owner));
    out.flags.push(...w.flags);
    for (const e of w.effects) (e.type === "draft" ? out.drafts : out.comments).push(e);
    if (w.effects.length) (didNow[o.owner] ??= []).push(`${link(issueOf[o.key])} ${o.title}${w.effects.some((e) => e.held) ? " (held back: failed my honesty check, needs a human)" : ""}`);
  });

  // 3. CARRY ON: coming on shift (or first run while on shift) -> read the last handover note on each issue, say what was picked up.
  const pickup = shifts.transitions.filter((t) => t.to === "on").map((t) => t.personId);
  if (shifts.first) pickup.push(...Object.keys(shifts.state).filter(onShift));
  for (const pid of pickup) {
    const date = local(now, PERSONAS[pid].tz).date, mine = open.filter((o) => o.owner === pid);
    const got = mine.map((o) => {
      const h = info[o.key].comments.filter((c) => c.body.includes("**Handover from")).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return h && `• ${link(issueOf[o.key])} (<${h.url}|note>) Next: ${h.body.match(/\*\*Next:\*\* (.+)/)?.[1] ?? "-"}`;
    }).filter(Boolean);
    const humans = mine.filter((o) => o.needs_human).length;
    const text = [`*${PERSONAS[pid].aiName} is on shift for ${first(pid)}.*`,
      got.length ? `Picked up from the last handover:\n${got.join("\n")}` : "Picked up from the last handover: no handover note on my issues yet, so I'm starting from the ledger.",
      didNow[pid]?.length ? `Done this cycle (proof on each issue):\n${didNow[pid].map((x) => `• ${x}`).join("\n")}` : `${mine.filter((o) => o.ai_can_do).length} item(s) of AI work on my issues, each logged on the issue.`,
      humans ? `${humans} item(s) need ${first(pid)} personally; I asked below, not the room.` : ""].filter(Boolean).join("\n");
    slack(`pickup ${pid}`, await say(pid, text, `[pickup:${pid}:${date}]`, note(pid)));
  }

  // 5. NEEDS HUMAN: ask the owner (only while they're on shift), once per obligation.
  for (const o of open.filter((o) => o.needs_human && onShift(o.owner)))
    slack(`ask ${o.key}`, await say(o.owner, `${first(o.owner)} (human), only you can decide: ${o.needs_human} Context: ${link(issueOf[o.key])}`, `[ask:${o.key}]`, note(o.owner)));

  shifts.save();
  return { reason, now: now.toISOString(), changes: r.changes ?? [], issues, transitions: shifts.transitions, first: shifts.first, simulated, ...out };
}

if (import.meta.filename === process.argv[1]) {
  const { cli } = await import("../kit/env.js");
  cli(async () => {
    const i = process.argv.indexOf("--now");
    const now = i > 0 ? new Date(process.argv[i + 1]) : new Date();
    if (isNaN(now)) throw new Error(`bad --now value "${process.argv[i + 1]}" (want ISO, e.g. 2026-10-24T19:30:00-05:00)`);
    const r = await runCycle({ reason: "cli", now });
    console.log(`clock: ${r.now}${r.simulated ? " (SIMULATED)" : ""} · ${r.first ? "first run: shift state recorded, no transitions" : `transitions: ${r.transitions.map((t) => `${t.personId} ${t.to}`).join(", ") || "none"}`}`);
    for (const e of [...r.handovers, ...r.comments, ...r.drafts, ...r.posted]) console.log(`+ ${e.what}: ${e.link}`);
    for (const f of r.flags) console.log(`! honesty: ${f}`);
    console.log(`cycle (${r.reason}) at ${r.now}: ${r.changes.length} changes, ${r.issues.filter((x) => x.action !== "unchanged").length} issues touched, ${r.comments.length} comments, ${r.posted.length} posts, ${r.drafts.length} drafts, ${r.handovers.length} handovers, ${r.flags.length} honesty flags`);
  });
}
