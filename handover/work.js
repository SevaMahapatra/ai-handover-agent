// The owner's AI finishing an obligation's ai_can_do, from the cited sources only. Every side effect is deduped in the tool:
// Linear comment marker "work:<key>:<hash>", Slack "[draft:<id>]". Honesty ($ amounts, dates, addresses) is checked in code.
import crypto from "node:crypto";
import { z } from "zod";
import { askJSON } from "../vision/claude.js";
import { requireEnv } from "../kit/env.js";
import { comment } from "../kit/linear.js";
import { findMessage, postAs, ensureChannels } from "../kit/slack.js";
import { makeIcs } from "../kit/ics.js";
import { freeSlots } from "../kit/slots.js";
import { addDraft, getDraft, setSlack } from "./drafts.js";
import { PERSONAS, CHANNELS, LINEAR_TEAM_KEY } from "./personas.js";
import { team } from "./sources.js";

export const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
export const workMarker = (o) => `work:${o.key}:${hash(o.ai_can_do)}`;
export const link = (i) => `<${i.url}|${i.identifier}>`;
export async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); }));
}

// Read-only: an issue's id and comments (kit/linear.js doesn't export a reader).
export async function linearIssue(identifier) {
  const { LINEAR_API_KEY } = requireEnv("LINEAR_API_KEY");
  const q = `query($id: String!) { issue(id: $id) { id identifier url team { key } comments(first: 250) { nodes { body url createdAt } } } }`;
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: { id: identifier } }) });
  const j = await res.json();
  if (j.errors?.length || !j.data?.issue) throw new Error(`linear: ${j.errors?.[0]?.message ?? `no issue ${identifier}`}`);
  if (j.data.issue.team.key !== LINEAR_TEAM_KEY) throw new Error(`refusing to touch ${identifier} outside ${LINEAR_TEAM_KEY}`);
  return { ...j.data.issue, comments: j.data.issue.comments.nodes };
}

// Slack, deduped by marker in the channel itself (survives a lost state/ folder).
export async function say(personId, text, marker, note = "") {
  const found = await findMessage(CHANNELS.handover, marker);
  if (found) return { ...found, existed: true };
  return { ...(await postAs(personId, CHANNELS.handover, `${text}${note}\n${marker}`)), existed: false };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MON = new RegExp(`\\b(\\d{1,2}) (${MON.join("|")})[a-z]*\\b`, "g");
const monthDays = (t) => [...[...t.matchAll(/(?<!\d)\d{4}-(\d{2})-(\d{2})(?!\d)/g)].map((m) => `${+m[1]}-${+m[2]}`),
  ...[...t.matchAll(DAY_MON)].map((m) => `${MON.indexOf(m[2]) + 1}-${+m[1]}`)];

// Every $ amount, date and email address must appear in the cited sources (audit() style flags).
export function honesty(where, text, addresses, cited) {
  const flags = [], have = new Set(monthDays(cited)), known = cited + team().map((p) => p.email).join(" ");
  for (const m of text.match(/\$\d+(,\d{3})*(\.\d+)?/g) ?? []) if (!cited.includes(m)) flags.push(`${where}: amount ${m} not in cited sources`);
  for (const d of new Set(monthDays(text))) if (!have.has(d)) flags.push(`${where}: date ${d} (month-day) not in cited sources`);
  for (const a of addresses.filter((a) => a.includes("@") && !a.startsWith("["))) if (!known.includes(a)) flags.push(`${where}: address ${a} not in cited sources`);
  return flags;
}
// Scheduling obligations get times DERIVED from the calendar (kit/slots.js), so the honesty check can accept them.
// Bare "call", "slot" and "booked" are left out on purpose: they matched non-scheduling work ("one-pager ... before the call",
// "a slot for the clip", "says the call is being booked"). Every real booking obligation in the ledger still matches.
const SCHEDULING = /\b(book|books|booking|schedule|scheduling|reschedule|rescheduling|slots|(new|alternative|another|free) slot|propose a time|site visit)\b/i;
// Customer time zones by keyword in owed_to (simple map; unknown customers just aren't constrained).
const EXTERNAL_TZ = [
  [/farah|crestline/i, "Farah", "Asia/Singapore"], [/ken|raj|harbor/i, "Harbor Point", "Asia/Singapore"],
  [/maria|northwind/i, "Maria", "America/Chicago"], [/tom reyes/i, "Tom", "America/Chicago"],
  [/omar|ridgeline/i, "Omar", "America/Chicago"], [/rachel|cedar/i, "Rachel", "America/Chicago"],
];
const TEAM_NAMES = { sam: /\bSam\b/, weilin: /\bWei Lin\b/, dana: /\bDana\b/, priya: /\bPriya\b/ };
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
// Returns null (not scheduling) or { slots, note }. Tries, in order, and says which one it used:
// (1) owner + named teammates, 09-18 local; (2) named teammates only (the owner books, doesn't attend), 09-18;
// (3) named teammates only, hours stretched EXPLICITLY to 08-20 local (stated in the note, never silent).
export function planSlots(o) {
  const text = `${o.title}\n${o.next_step ?? ""}\n${o.ai_can_do ?? ""}`;
  if (!o.ai_can_do || !SCHEDULING.test(text)) return null;
  const named = Object.keys(TEAM_NAMES).filter((id) => id !== o.owner && TEAM_NAMES[id].test(text));
  const external = EXTERNAL_TZ.filter(([re]) => re.test(o.owed_to ?? "")).map(([, name, tz]) => ({ name, tz }));
  const durationMin = +(text.match(/(\d+)[- ]min/)?.[1] ?? (/site visit/i.test(text) ? 120 : /call/i.test(text) ? 45 : 30));
  const days = [...new Set([...o.title.matchAll(/\b(Mon|Tue|Wed|Thu|Fri)\b/g)].map((m) => WEEKDAY[m[1]]))];
  const base = { external, durationMin, prefer: /morning/i.test(text) ? "morning" : undefined, ...(days.length && { days }) };
  const tries = [[[o.owner, ...named], [9, 18], "owner + teammates, 09:00-18:00 local"]];
  if (named.length) tries.push([named, [9, 18], `${named.join(" + ")} only (owner books), 09:00-18:00 local`],
    [named, [8, 20], `${named.join(" + ")} only, hours STRETCHED to 08:00-20:00 local because 09:00-18:00 has no overlap`]);
  let reason = "";
  for (const [people, hours, how] of tries) {
    const slots = freeSlots({ ...base, people, hours });
    if (slots.length) return { slots, note: `computed for ${how}, ${durationMin} min, external: ${external.map((e) => `${e.name} (${e.tz})`).join(", ") || "none"}` };
    reason = slots.reason;
  }
  return { slots: [], note: reason };
}
const slotText = (s) => s.slots.map((x) => `${x.label} [${x.start} to ${x.end}]`).join("\n");
export const NO_SLOTS = "No common free time found in the calendar; needs a human.";

export const citedText = (refs, byRef) => refs.map((r) => byRef[r]).filter(Boolean).map((s) => `[${s.ref}] ${s.kind} | ${s.at ?? "-"} | ${s.from}\n${s.text}`).join("\n\n");

const Work = z.object({
  kind: z.enum(["email", "doc", "linear_update"]),
  subject: z.string().nullable(),
  intendedTo: z.array(z.string()),
  cc: z.array(z.string()),
  body: z.string(),
  ics: z.object({ title: z.string(), start: z.string(), end: z.string(), attendees: z.array(z.string()), location: z.string() }).nullable(),
  sources: z.array(z.string()),
});
const SYSTEM = (p) => `You are ${p.signature}. Do one piece of work for ${p.name} from the given sources and obligation.
Rules:
- Use only facts written in the given sources. Never invent a price, date, time, name, or address.
- Anything that needs a human gets a clearly marked placeholder, e.g. [PRICE: Sam to decide], [LOCATION: Sam to confirm], [DATE: Dana to confirm].
- kind "email" if the work is an email to someone (intendedTo = their addresses as written in the sources); "doc" for an outline, draft document, or a WhatsApp/Slack message draft; "linear_update" for board housekeeping.
- Emails start by saying they are from ${p.aiName}, an AI assistant writing on behalf of ${p.name}. Do not add a signature.
- Any proposed meeting time is labelled PROPOSED (also in ics.title), avoids every conflict listed, and uses only dates written in the sources or the PROPOSED TIMES given (offer exactly those, never other times). ics only if a meeting is proposed (ISO times with offset), else null.
- sources: the refs you actually used. Keep it short and usable.`;

// Returns { effects: [{type, what, link}], flags: [] }. Skips if the work marker is already on the issue.
export async function doWork(o, issue, byRef, conflicts, note = "") {
  const p = PERSONAS[o.owner], marker = workMarker(o), effects = [], flags = [];
  const prior = issue.comments.find((c) => c.body.includes(marker));
  if (prior) return (await restoreDraft(o, prior), { effects, flags, skipped: true });
  const cited = citedText(o.sources, byRef);
  const plan = planSlots(o);
  const times = !plan ? "" : plan.slots.length
    ? `\n\nPROPOSED TIMES YOU MAY OFFER (computed from the calendar; ${plan.note}):\n${slotText(plan)}\nRule: if you offer meeting times, offer exactly these, labelled PROPOSED, never other times. Any ics uses the first one.`
    : `\n\nPROPOSED TIMES: none. ${NO_SLOTS} (${plan.note}). Do not propose any time; write "${NO_SLOTS}" and use a [TIME: ...] placeholder.`;
  const w = await askJSON({
    system: SYSTEM(p), effort: "low", schema: Work,
    content: [{ type: "text", text: `Obligation:\n${JSON.stringify(o, null, 1)}\n\nKnown conflicts (avoid):\n${conflicts.map((c) => `- ${c.what}`).join("\n")}\n\nSources:\n${cited}${times}\n\nDo this now: ${o.ai_can_do}` }],
  });
  if (plan && !plan.slots.length) { w.ics = null; if (!w.body.includes(NO_SLOTS)) w.body += `\n\n${NO_SLOTS}`; }
  if (plan?.slots.length && w.ics) Object.assign(w.ics, { start: plan.slots[0].start, end: plan.slots[0].end });
  const refs = w.sources.filter((r) => o.sources.includes(r));
  const all = `${w.subject ?? ""}\n${w.body}\n${w.ics ? `${w.ics.start} ${w.ics.end} ${w.ics.title}` : ""}`;
  flags.push(...honesty(o.key, all, [...w.intendedTo, ...w.cc, ...(w.ics?.attendees ?? [])], `${cited} ${o.sources.map((r) => byRef[r]?.at ?? "").join(" ")} ${plan ? slotText(plan) : ""}`));
  if (w.ics && !/PROPOSED/.test(w.ics.title)) w.ics.title = `PROPOSED: ${w.ics.title}`;
  if (plan?.slots.length) note = `${note}\n_Proposed times computed from the calendar (${plan.note})._`;
  const srcLine = `Sources: ${refs.join(", ") || "-"}`;
  if (flags.length) {
    const r = await comment(issue.id, `**${p.aiName} held this back** (honesty check failed, nothing was posted or drafted):\n\n${flags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.\n\nmarker: ${marker}`);
    return { effects: [{ type: "comment", what: `${issue.identifier} held back (honesty)`, link: r.url, held: true }], flags };
  }
  if (w.kind !== "email") {
    const r = await comment(issue.id, `**${p.aiName} did this:**\n\n${w.body}\n\n${srcLine}\n\nmarker: ${marker}`);
    return { effects: [{ type: "comment", what: `${issue.identifier} ${w.kind}`, link: r.url }], flags };
  }
  const id = `email:${o.key}`;
  const payload = { personId: o.owner, intendedTo: w.intendedTo, cc: w.cc, subject: w.subject ?? o.title, text: w.body, marker: id,
    ...(w.ics && { ics: { uid: `${o.key}@zapdemo-handover`, organizer: p.email, description: `Proposed by ${p.signature}. ${srcLine}`, ...w.ics } }) };
  if (payload.ics) makeIcs(payload.ics); // validates the times before anything is posted
  const d = addDraft({ id, personId: o.owner, obligationKey: o.key, payload });
  const quote = d.payload.text.split("\n").map((l) => `> ${l}`).join("\n");
  const s = d.slack ?? (await say(o.owner, `Draft for ${d.payload.intendedTo.join(", ")}: *${d.payload.subject}*${d.payload.ics ? ` (with a PROPOSED invite: ${d.payload.ics.start})` : ""}\n${quote}\n${srcLine} · ${link(issue)}\nReact :white_check_mark: to send, :x: to discard.`, `[draft:${id}]`, note));
  if (!d.slack) setSlack(id, { channel: s.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
  if (!s.existed && !d.slack) effects.push({ type: "draft", what: `${id} posted for approval`, link: s.permalink });
  const r = await comment(issue.id, `**${p.aiName} drafted an email** (not sent, waiting for ${p.name}'s :white_check_mark: in Slack): ${s.permalink}\n\n**To:** ${payload.intendedTo.join(", ")} · **Subject:** ${payload.subject}\n\n${quote}\n\n${srcLine}\n\nmarker: ${marker}\n\nDraft payload:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);
  effects.push({ type: "comment", what: `${issue.identifier} email draft`, link: r.url });
  return { effects, flags };
}

// state/drafts.json lost (fresh checkout): rebuild the draft from the Linear comment + the Slack message, no reposting.
async function restoreDraft(o, prior) {
  const id = `email:${o.key}`;
  if (getDraft(id)) return;
  const json = prior.body.match(/```json\n(.+)\n```/s)?.[1];
  if (!json) return;
  addDraft({ id, personId: o.owner, obligationKey: o.key, payload: JSON.parse(json) });
  const s = await findMessage(CHANNELS.handover, `[draft:${id}]`);
  if (s) setSlack(id, { channel: (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
}
