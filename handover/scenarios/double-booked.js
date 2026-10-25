// Scenario 2 "Double-booked install day": spot calendar clashes in code, offer the new lead 3 computed slots (draft for Sam's ✅),
// and send the engineer the promised one-pager before the call (draft). Contract: handover/scenarios/index.js.
import fs from "node:fs";
import { z } from "zod";
import { askJSON } from "../../vision/claude.js";
import { comment } from "../../kit/linear.js";
import { findMessage, postAs, ensureChannels } from "../../kit/slack.js";
import { makeIcs } from "../../kit/ics.js";
import { freeSlots, label } from "../../kit/slots.js";
import { addDraft, getDraft, setSlack } from "../drafts.js";
import { say, link, honesty, citedText } from "../work.js";
import { PERSONAS, CHANNELS } from "../personas.js";
import { local } from "../shift.js";
import { team } from "../sources.js";
import { scenarioCli } from "./index.js";

export const id = "double-booked";
export const scenario = 2;

const EVENTS = new URL("../../work_pack/work_pack/calendar/events.json", import.meta.url);
const FARAH = { name: "Farah", tz: "Asia/Singapore", email: "farah.aziz@crestline-dc.example" }; // address from E05
const ONEPAGER_SUBJECT = "Crestline one-pager before the 3 Nov call (you weren't cc'd)";
const Email = z.object({ subject: z.string(), body: z.string(), sources: z.array(z.string()) });
const has = (ctx, key, m) => ctx.info[key]?.comments.some((c) => c.body.includes(m));
const quote = (t) => t.split("\n").map((l) => `> ${l}`).join("\n");

// Overlaps per teammate, from the calendar events themselves (not the ledger text).
export function clashes() {
  const ev = JSON.parse(fs.readFileSync(EVENTS, "utf8")), out = [];
  for (const p of team()) {
    const mine = ev.filter((e) => e.attendees.includes(p.id));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const [a, b] = [mine[i], mine[j]];
      if (Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)) out.push({ person: p, a, b });
    }
  }
  return out;
}
const when = (e, tz) => `${label(Date.parse(e.start), tz)}-${label(Date.parse(e.end), tz).slice(-9, -4)}`;

// Slack post for a draft: reply in today's founder decision-queue thread if asked and present, else a #handover post.
async function postDraft(ctx, personId, d, text, scnMarker, inQueue) {
  const tag = `[draft:${d.id}]`;
  let thread = null;
  if (inQueue) thread = await findMessage(CHANNELS.handover, `[queue:sam:${local(ctx.now, PERSONAS.sam.tz).date}`);
  const body = `${text}\n${tag} ${scnMarker}`;
  const s = thread
    ? ((await findMessage(CHANNELS.handover, tag, { thread_ts: thread.ts })) ?? (await postAs(personId, CHANNELS.handover, `${body}${ctx.note(personId)}`, { thread_ts: thread.ts })))
    : await say(personId, body, scnMarker, ctx.note(personId));
  const channel = (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover];
  setSlack(d.id, { channel, ts: s.ts, permalink: s.permalink });
  return { ...s, where: thread ? "founder decision-queue thread" : "#handover" };
}

async function draftPart(ctx, { what, key, owner, refs, extraCited = "", ask, intendedTo, cc, ics, finish, slackText, inQueue }) {
  const marker = `scn:double-booked:${what}`, issue = ctx.issueOf[key], p = PERSONAS[owner];
  if (!issue) return (console.log(`  - skip ${what}: no Linear issue for ${key}`), []);
  if (has(ctx, key, `marker: ${marker}`)) return [];
  if (!ctx.dry && !ctx.onShift(owner)) return (console.log(`  - skip ${what}: ${p.name} is off shift (${local(ctx.now, p.tz).label}); ${p.aiName} acts only on shift`), []);
  if (ctx.dry) return [{ type: "draft", what: `${p.aiName} would draft "${what}" to ${intendedTo.join(", ")} on ${issue.identifier}`, link: "(dry)" }];
  const id = `email:scn-double-booked-${what}`, cited = citedText(refs, ctx.byRef);
  let d = getDraft(id);
  if (!d) {
    const w = await askJSON({ effort: "low", schema: Email, system: `You are ${p.signature}. Use only facts in the given sources; never invent a price, date, time, name or address (use a [PLACEHOLDER: who decides] instead). Start by saying the email is from ${p.aiName}, an AI assistant writing on behalf of ${p.name}. No signature. sources = refs you used.`,
      content: [{ type: "text", text: `Sources:\n${cited}${extraCited}\n\nWrite this email now: ${ask}` }] });
    const payload = { personId: owner, intendedTo, cc, subject: what === "onepager" ? ONEPAGER_SUBJECT : w.subject, text: finish(w.body), marker: id, ...(ics && { ics }) };
    const flags = honesty(key, `${payload.subject}\n${payload.text}\n${ics ? `${ics.start} ${ics.end}` : ""}`, [...intendedTo, ...cc, ...(ics?.attendees ?? [])], `${cited} ${extraCited}`);
    if (flags.length) {
      const r = await comment(ctx.info[key].id, `**${p.aiName} held this back** (honesty check failed, nothing drafted):\n\n${flags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.\n\nmarker: ${marker}`);
      return [{ type: "linear", what: `${issue.identifier} ${what} held back (honesty)`, link: r.url, held: true }];
    }
    if (ics) makeIcs(ics); // validates times before anything is posted
    d = addDraft({ id, personId: owner, obligationKey: key, payload });
  }
  const s = await postDraft(ctx, owner, d, slackText(d, quote(d.payload.text), link(issue)), `[scn:double-booked:${what}:${ctx.mode}]`, inQueue);
  const r = await comment(ctx.info[key].id, `**${p.aiName} drafted an email** (not sent, waiting for ✅ in Slack): ${s.permalink}\n\n**To:** ${d.payload.intendedTo.join(", ")} · **Subject:** ${d.payload.subject}\n\n${quote(d.payload.text)}\n\nSources: ${refs.join(", ")}\n\nmarker: ${marker}`);
  return [{ type: "draft", what: `${id} posted in ${s.where}`, link: s.permalink }, { type: "linear", what: `${issue.identifier} ${what} draft noted`, link: r.url }];
}

export async function run(ctx) {
  const out = [];
  const clashKey = ctx.ledger.obligations.find((o) => o.sources.includes("K01") && o.sources.includes("K02"))?.key;
  const issue = clashKey && ctx.issueOf[clashKey];
  const found = clashes();
  if (!found.length) console.log("  - no calendar clashes found");
  if (!issue) console.log("  - no Linear issue cites both K01 and K02; clash comments skipped");

  // 1. Clash detection: one Linear comment per overlap.
  for (const { person, a, b } of issue ? found : []) {
    const marker = `scn:double-booked:clash:${person.id}:${a.start}:${b.start}`;
    if (has(ctx, clashKey, `marker: ${marker}`)) continue;
    const what = `Clash detected from the calendar: ${a.title} vs ${b.title} for ${person.name}`;
    if (ctx.dry) { out.push({ type: "linear", what: `${issue.identifier}: ${what}`, link: "(dry)" }); continue; }
    const r = await comment(ctx.info[clashKey].id, `${what}\n\n- ${a.title}: ${when(a, person.tz)} @ ${a.where}\n- ${b.title}: ${when(b, person.tz)} @ ${b.where}\n\n_Computed by the handover AI from work_pack calendar/events.json (K01, K02)._\n\nmarker: ${marker}`);
    out.push({ type: "linear", what: `${issue.identifier}: ${what}`, link: r.url });
  }

  // 2. Three PROPOSED slots for Farah (45 min, Wei Lin required, all busy time avoided), Dana's AI drafts the email.
  if (clashKey) {
    const from = local(new Date(ctx.now.getTime() + 864e5), "Asia/Singapore").date;
    const slots = freeSlots({ people: ["weilin"], external: [FARAH], durationMin: 45, from, count: 3 });
    const slotList = slots.map((s, i) => `${i + 1}. PROPOSED: ${s.label}`).join("\n");
    if (slots.length) console.log(`  - slots for Farah (Wei Lin required, from ${from}):\n${slotList.replace(/^/gm, "      ")}`);
    if (!slots.length) console.log(`  - slots: no common time (${slots.reason}); nothing drafted, a human should rebook`);
    else out.push(...(await draftPart(ctx, {
      what: "slots", key: clashKey, owner: "dana", inQueue: true, refs: ["C03", "E05", "W03", "K01", "K02"],
      extraCited: `\n\nPROPOSED TIMES (computed from the calendar):\n${slotList}`,
      ask: `Email Farah (${FARAH.email}): the 3 Nov 15:00 SGT call clashes with our engineer Wei Lin's install, so offer the PROPOSED times listed (refer to them as "the times below"; do NOT write any times or dates yourself, they are appended in code). Confirm Wei Lin will show the floor-by-floor progress demo she asked for (W03). Short.`,
      intendedTo: [FARAH.email], cc: ["weilin@zapdemo.example"],
      ics: { uid: "scn-double-booked-crestline@zapdemo-handover", title: "PROPOSED: Crestline Data Centers call (floor-by-floor demo)", start: slots[0]?.start, end: slots[0]?.end,
        attendees: [FARAH.email, "weilin@zapdemo.example", "dana@zapdemo.example"], organizer: "dana@zapdemo.example", location: "Video call",
        description: `Proposed by ${PERSONAS.dana.signature}. Slot 1 of 3. Sources: C03, E05, W03, K01, K02` },
      finish: (b) => `${b}\n\nPROPOSED times (computed from the calendar, all clear of the install):\n${slotList}${/floor.by.floor/i.test(b) ? "" : "\n\nWei Lin will show the floor-by-floor progress tracking you asked about."}`,
      slackText: (d, q, l) => `*Founder approval: new times for Crestline.* Draft to ${d.payload.intendedTo.join(", ")}: *${d.payload.subject}* (PROPOSED invite: slot 1, ${d.payload.ics.start})\n${q}\nSources: C03, E05, W03, K01, K02 · ${l}\n*Sam: ✅ approves these slots, ❌ declines.*`,
    })));
  }

  // 3. The promised one-pager, internal draft to Wei Lin (he wasn't cc'd), from C03/E05/W03 only.
  const pagerKey = ctx.ledger.obligations.find((o) => o.sources.includes("C03") && o.sources.includes("E05") && o.key !== clashKey)?.key;
  if (pagerKey) out.push(...(await draftPart(ctx, {
    what: "onepager", key: pagerKey, owner: "priya", refs: ["C03", "E05", "W03"],
    ask: `Internal email to Wei Lin (weilin@zapdemo.example), our engineer, who was not cc'd when Dana promised Farah a one-pager before the call. Body = the one-pager outline (headings + bullets) on tracking data-centre fit-out progress floor by floor, using only C03/E05/W03. Mark anything the sources don't give (results, prices, specs) as [PLACEHOLDER: Wei Lin to fill].`,
    intendedTo: ["weilin@zapdemo.example"], cc: [],
    finish: (b) => b,
    slackText: (d, q, l) => `✉️ Draft to ${d.payload.intendedTo.join(", ")}: *${d.payload.subject}*\n${q}\nSources: C03, E05, W03 · ${l}\n✅ send · ❌ discard`,
  })));
  else console.log("  - no one-pager obligation (C03 + E05) in the ledger");
  return out;
}

if (import.meta.filename === process.argv[1]) await scenarioCli(run);
