// Scenario 3 "Warehouse proposal": Sam's AI turns Maria's open questions (C01/E03/E15) into ONE reply draft, and handles the
// price honestly: the pack has no pricing rules, so the price stays [PRICE: Sam to decide] until Sam answers in the decision
// queue (a "decision" drop). Founder approves the price; ✅ on the draft sends it (refused while a [PLACEHOLDER] remains).
import { z } from "zod";
import { askJSON } from "../../vision/claude.js";
import { comment } from "../../kit/linear.js";
import { findMessage, ensureChannels } from "../../kit/slack.js";
import { addDraft, getDraft, setSlack } from "../drafts.js";
import { PERSONAS, CHANNELS } from "../personas.js";
import { say, link, honesty, citedText } from "../work.js";
import { scenarioCli } from "./index.js";

export const id = "warehouse-proposal";
export const scenario = 3;

const KEY = "northwind-price", OWNER = "sam", TO = "maria.gomez@northwind-cold.example";
const REFS = ["C01", "E01", "E03", "E15", "S03", "S04", "C09", "E10", "ZAP-101", "ZAP-102", "ZAP-103", "ZAP-104", "ZAP-105"];
const PLACEHOLDER = "[PRICE: Sam to decide]", TOKEN = "{{PRICE}}";
const NO_RULES = "No pricing rules in the work pack, so I can't compute a price. The supplier quote ($4,680, C09/E10) is our cost, not a price. Waiting on Sam via the decision queue.";

// Sam's latest decision-queue answer about the Northwind price, quoted verbatim (after the "Sam's answer for <title>:" prefix).
function samPrice(sources) {
  const d = sources.filter((s) => /decision/.test(s.kind) && /northwind/i.test(s.text) && /price/i.test(s.text)).at(-1);
  if (!d) return null;
  const value = d.text.replace(/^Sam's answer for [^:]*:\s*/i, "").replace(/^\s*#?\d+\s*[:.)-]\s*/, "").trim();
  return value ? { ref: d.ref, value } : null;
}

const Email = z.object({ subject: z.string(), body: z.string(), sources: z.array(z.string()) });
const SYSTEM = (p) => `You are ${p.signature}. Write ONE reply email from Sam to Maria Gomez that answers every open question or ask she has
raised across the sources (C01, E03, E15). Rules:
- Start by saying it is from ${p.aiName}, an AI assistant writing on behalf of ${p.name}. No signature.
- Apologise plainly that the Thursday deadline was missed.
- Summarise the camera layout from Wei Lin's message (S04) using only its facts.
- The call with Tom Reyes: say Dana (our sales caller) is booking it and will send times. Do not propose any time yourself.
- The one-pager for her VP: say Priya is preparing it. Give no date.
- The price: write the literal token ${TOKEN} exactly once where the price goes. Never write any $ amount or number for the price.
  Never mention our supplier or its quote: that is our cost, not her price.
- Only facts from the sources. Short and usable. sources = refs you used.`;

export async function run(ctx) {
  const o = ctx.ledger.obligations.find((x) => x.key === KEY), issue = ctx.issueOf[KEY], info = ctx.info[KEY];
  if (!o || o.status === "done" || !issue || !info) return [];
  if (!ctx.dry && !ctx.onShift(OWNER)) return [];
  const p = PERSONAS[OWNER], price = samPrice(ctx.sources), state = price ? "priced" : "pending";
  const draftId = `email:northwind-proposal:${state}`, out = [], dry = ctx.dry;
  const has = (m) => info.comments.find((c) => c.body.includes(`marker: ${m}`));
  const cited = citedText([...REFS, ...(price ? [price.ref] : [])], ctx.byRef);

  // 1. Price: say plainly why there is no number yet (only while no answer from Sam).
  if (!price) {
    const m = `scn:${id}:price-pending`;
    if (!has(m)) {
      const flags = honesty(KEY, NO_RULES, [], cited);
      const body = flags.length ? `**${p.aiName} held this back** (honesty check failed):\n${flags.map((f) => `- ${f}`).join("\n")}` : `**${p.aiName}:** ${NO_RULES}`;
      const r = dry ? { url: "(dry)" } : await comment(info.id, `${body}\n\nSources: C09, E10, ZAP-102\n\nmarker: ${m}`);
      out.push({ type: "linear", what: `${issue.identifier} price: no pricing rules, waiting on Sam`, link: r.url, ...(flags.length && { held: true }) });
    }
  }

  // 2. One email for all of Maria's asks. Claude only when this state's marker isn't on the issue yet.
  const m = `scn:${id}:draft:${state}`, prior = has(m), slackMarker = `[draft:${draftId}] [scn:${id}:draft-${state}:${ctx.mode}]`;
  if (prior) {
    if (!dry && !getDraft(draftId)) { // state/ lost: rebuild the draft from the Linear comment, no reposting
      const json = prior.body.match(/```json\n(.+)\n```/s)?.[1];
      if (json) {
        addDraft({ id: draftId, personId: OWNER, obligationKey: KEY, payload: JSON.parse(json) });
        const s = await findMessage(CHANNELS.handover, `[draft:${draftId}]`);
        if (s) setSlack(draftId, { channel: (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
      }
    }
    return out;
  }
  const w = await askJSON({ system: SYSTEM(p), effort: "low", schema: Email,
    content: [{ type: "text", text: `Obligation:\n${JSON.stringify(o, null, 1)}\n\nSources:\n${cited}` }] });
  let text = w.body.includes(TOKEN) ? w.body : `${w.body}\n\nPrice: ${TOKEN}`;
  text = text.replaceAll(TOKEN, price ? price.value : PLACEHOLDER);
  const refs = [...new Set([...w.sources.filter((r) => REFS.includes(r)), ...(price ? [price.ref] : [])])];
  const srcLine = `Sources: ${refs.join(", ")}`;
  const flags = honesty(KEY, `${w.subject}\n${text}`, [TO], `${cited} ${REFS.map((r) => ctx.byRef[r]?.at ?? "").join(" ")}`);
  if (flags.length) {
    const r = dry ? { url: "(dry)" } : await comment(info.id, `**${p.aiName} held this back** (honesty check failed, nothing drafted):\n\n${flags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.\n\nmarker: ${m}`);
    return [...out, { type: "linear", what: `${issue.identifier} Northwind email held back (honesty)`, link: r.url, held: true }];
  }
  const payload = { personId: OWNER, intendedTo: [TO], cc: [], subject: w.subject, text, marker: draftId };
  const quote = text.split("\n").map((l) => `> ${l}`).join("\n");
  if (dry) return [...out, { type: "draft", what: `${draftId} (${price ? `price "${price.value}" from ${price.ref}` : `placeholder ${PLACEHOLDER}`}) To: ${TO} Subject: ${w.subject}\n${quote}\n${srcLine}\n`, link: "(dry)" }];

  const d = addDraft({ id: draftId, personId: OWNER, obligationKey: KEY, payload });
  const how = price ? `Price is Sam's answer from the decision queue (${price.ref}), quoted verbatim.` : `Price left as ${PLACEHOLDER}: ${NO_RULES}`;
  const s = d.slack ?? (await say(OWNER, `Draft for ${TO}: *${w.subject}* (one email answering all of Maria's open asks)\n${quote}\n${how}\n${srcLine} · ${link(issue)}\n✅ sends once the price is filled in; ✅ is refused while a [PLACEHOLDER] remains. ❌ discards.`, slackMarker, ctx.note(OWNER)));
  if (!d.slack) setSlack(draftId, { channel: s.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
  if (!s.existed && !d.slack) out.push({ type: "draft", what: `${draftId} posted for Sam's ✅`, link: s.permalink });
  const r = await comment(info.id, `**${p.aiName} drafted the Northwind reply** (not sent, waiting for Sam's ✅ in Slack): ${s.permalink}\n\n**To:** ${TO} · **Subject:** ${w.subject}\n\n${quote}\n\n${how}\n${srcLine}\n\nmarker: ${m}\n\nDraft payload:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);
  out.push({ type: "linear", what: `${issue.identifier} Northwind email draft (${state})`, link: r.url });
  return out;
}

if (import.meta.filename === process.argv[1]) await scenarioCli(run);
