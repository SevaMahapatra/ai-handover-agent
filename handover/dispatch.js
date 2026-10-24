// Dispatcher: reads every source (+ the current ledger, if any) and produces the obligations ledger:
// what's owed, to whom, by when, the right owner, and the source refs it came from.
// Honesty is enforced in code after the model answers: unknown refs, dates or $ amounts not found in cited sources get flagged.
// node handover/dispatch.js   -> writes state/ledger.json, prints it grouped by owner
import fs from "node:fs";
import { z } from "zod";
import { askJSON } from "../vision/claude.js";
import { loadSources, team } from "./sources.js";

export const LEDGER = "state/ledger.json";
const TEAM = team();
const OWNERS = TEAM.map((p) => p.id);

const Obligation = z.object({
  key: z.string(), // stable kebab slug, e.g. "northwind-price". Keep existing keys unchanged.
  title: z.string(),
  owed_to: z.string(), // person/company who is waiting
  due: z.string().nullable(), // YYYY-MM-DD, only if a source states it
  owner: z.enum(OWNERS),
  status: z.enum(["open", "blocked", "waiting_external", "done"]),
  why: z.string(), // who asked and why it matters, one line
  next_step: z.string(),
  ai_can_do: z.string().nullable(), // what the owner's AI can finish without a human
  needs_human: z.string().nullable(), // decision only the owner can make (price, approval, signature)
  linear_ids: z.array(z.string()), // existing ZAP-xxx issues this covers
  sources: z.array(z.string()),
});
const Ledger = z.object({
  obligations: z.array(Obligation),
  conflicts: z.array(z.object({ what: z.string(), owner: z.enum(OWNERS), sources: z.array(z.string()) })),
  linear_fixes: z.array(z.object({ linear_id: z.string(), fix: z.string(), sources: z.array(z.string()) })), // stale, duplicate, unowned
});

const SYSTEM = `You are the dispatcher for a 4-person company split between Austin and Singapore. Work gets dropped at shift change.
From the sources, build the ledger of everything still owed: what, to whom, by when, and the ONE right owner, using each person's "owns" list.
Hard rules:
- Use only facts in the sources. Never invent a price, date, name, or commitment. A supplier quote is our cost, not a customer price.
- Every obligation cites the refs it came from (C01, E03, S05, W02, K01, ZAP-102, D01...). due must be a date written in a cited source, or null.
- Later sources override earlier ones. Mark things done if a source shows they were done.
- Pricing, approvals, payments, and anything contractual -> needs_human for sam. Booking meetings -> dana. Installs, layouts, deploys, onboarding -> weilin. One-pagers, case studies, posts -> priya.
- ai_can_do: concrete work the owner's AI can finish from the sources alone (draft an email, write a one-pager outline, propose a calendar slot, close a duplicate). null if none.
- conflicts: double bookings or facts that contradict each other.
- linear_fixes: issues that are stale, duplicated, unowned, or contradicted by newer sources.
- If a current ledger is given, keep its keys for the same obligations and update them; add new ones only for new work.`;

export async function dispatch() {
  const sources = loadSources();
  const prev = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : null;
  const text = [
    `Now: Saturday 24 Oct 2026, 3pm Austin (America/Chicago) = Sunday 4am Singapore.`,
    `Team:\n${JSON.stringify(TEAM)}`,
    `Sources:\n${sources.map((s) => `[${s.ref}] ${s.kind} | ${s.at ?? "-"} | ${s.from}\n${s.text}`).join("\n\n")}`,
    prev ? `Current ledger (keep keys):\n${JSON.stringify({ obligations: prev.obligations })}` : "No ledger yet.",
  ].join("\n\n");
  const ledger = await askJSON({ system: SYSTEM, schema: Ledger, effort: "high", max_tokens: 16000, content: [{ type: "text", text }] });
  ledger.honesty_flags = audit(ledger, sources);
  ledger.updated_at = new Date().toISOString();
  ledger.source_refs = sources.map((s) => s.ref);
  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  return ledger;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Checks every claim the model made against the cited source text.
export function audit(ledger, sources) {
  const byRef = Object.fromEntries(sources.map((s) => [s.ref, s]));
  const flags = [];
  const check = (where, refs, fields) => {
    const bad = refs.filter((r) => !byRef[r]);
    if (bad.length) flags.push(`${where}: unknown source ref(s) ${bad.join(", ")}`);
    if (!refs.length) flags.push(`${where}: no sources cited`);
    const cited = refs.map((r) => `${byRef[r]?.text ?? ""} ${byRef[r]?.at ?? ""}`).join(" ");
    for (const m of fields.join(" ").match(/\$[\d,]+/g) ?? [])
      if (!cited.includes(m)) flags.push(`${where}: amount ${m} not in cited sources`);
    return cited;
  };
  for (const o of ledger.obligations) {
    const cited = check(o.key, o.sources, [o.title, o.why, o.next_step, o.ai_can_do ?? "", o.needs_human ?? ""]);
    if (o.due) {
      const [y, m, d] = o.due.split("-").map(Number);
      const forms = [o.due, `${d} ${MON[m - 1]}`];
      if (!forms.some((f) => cited.includes(f))) flags.push(`${o.key}: due ${o.due} not written in cited sources`);
    }
    for (const id of o.linear_ids) if (!byRef[id]) flags.push(`${o.key}: unknown Linear issue ${id}`);
  }
  ledger.conflicts.forEach((c, i) => check(`conflict#${i + 1}`, c.sources, [c.what]));
  ledger.linear_fixes.forEach((f) => {
    if (!byRef[f.linear_id]) flags.push(`linear_fix ${f.linear_id}: unknown issue`);
    check(`linear_fix ${f.linear_id}`, f.sources, [f.fix]);
  });
  return flags;
}

if (import.meta.filename === process.argv[1]) {
  const t0 = Date.now();
  const l = await dispatch();
  for (const p of TEAM) {
    const mine = l.obligations.filter((o) => o.owner === p.id);
    console.log(`\n## ${p.name} (${p.role}, ${p.city}): ${mine.length}`);
    for (const o of mine)
      console.log(`- [${o.status}] ${o.title}${o.due ? ` (due ${o.due})` : ""} -> ${o.owed_to}  [${o.sources.join(",")}]${o.needs_human ? `\n    HUMAN: ${o.needs_human}` : ""}${o.ai_can_do ? `\n    AI: ${o.ai_can_do}` : ""}`);
  }
  console.log(`\n## Conflicts\n${l.conflicts.map((c) => `- ${c.what} (${c.owner}) [${c.sources}]`).join("\n")}`);
  console.log(`\n## Linear fixes\n${l.linear_fixes.map((f) => `- ${f.linear_id}: ${f.fix} [${f.sources}]`).join("\n")}`);
  console.log(`\n## Honesty flags: ${l.honesty_flags.length}\n${l.honesty_flags.map((f) => `- ${f}`).join("\n")}`);
  console.log(`\n${l.obligations.length} obligations -> ${LEDGER} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
