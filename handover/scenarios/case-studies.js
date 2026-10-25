// Scenario 10 "Case studies": Priya's AI drafts the Bayview case study, asks Lisa (Bayview) to approve it via a ✅ email draft,
// and drafts the LinkedIn post, gated on Bayview's approval + Wei Lin's 30s clip. Human part: the customer approves.
import { z } from "zod";
import { askJSON } from "../../kit/claude.js";
import { comment } from "../../kit/linear.js";
import { ensureChannels } from "../../kit/slack.js";
import { honesty, citedText, say, link, workMarker } from "../work.js";
import { addDraft, listDrafts, setSlack } from "../drafts.js";
import { PERSONAS, CHANNELS } from "../personas.js";
import { scenarioCli, keyFor } from "./index.js";

export const id = "case-studies";
export const scenario = 10;
const OWNER = "priya";
let CS = "bayview-case-study", LI = "linkedin-post-monday"; // resolved from pack ids ZAP-170 / ZAP-171 in run()
const REFS = ["C08", "E14", "S10", "ZAP-170", "ZAP-171", "C05", "E07", "S14", "W04"];
const LISA = "lisa.park@bayview-freight.example";
const M = (what) => `scn:case-studies:${what}`;
const Out = z.object({ caseStudy: z.string(), linkedinPost: z.string(), sources: z.array(z.string()) });

// Approval only counts if a later decision/drop says Bayview or Lisa approved (none in the pack).
const approval = (sources) => sources.find((s) => (s.kind === "decision" || s.kind.startsWith("drop-"))
  && /bayview|lisa/i.test(s.text) && /\b(approved|approves|signed off|ok(ay)? to (publish|post|go public))\b/i.test(s.text)
  && !/\b(not|hasn't|has not|until|before|pending|waiting)\b[^.]*\bapprov/i.test(s.text));

export async function run(ctx) {
  CS = keyFor(ctx, "ZAP-170", CS);
  LI = keyFor(ctx, "ZAP-171", LI);
  const p = PERSONAS[OWNER], out = [], csI = ctx.issueOf[CS], liI = ctx.issueOf[LI];
  if (!csI || !liI) return [{ type: "linear", what: `skipped: no Linear issue for ${!csI ? CS : LI} in the ledger`, link: "" }];
  if (!ctx.dry && !ctx.onShift(OWNER)) return [];
  const has = (key, m) => (ctx.info[key]?.comments ?? []).some((c) => c.body.includes(`marker: ${m}`));
  const cited = citedText(REFS, ctx.byRef), atText = REFS.map((r) => ctx.byRef[r]?.at ?? "").join(" ");
  const ok = approval(ctx.sources), gate = ok
    ? `Bayview approval found in ${ok.ref}. Clip from Wei Lin: not in the sources yet.`
    : "WAITING: posts only after Bayview approves (no approval in the sources yet) and the 30s clip from Wei Lin arrives.";
  const srcLine = `Sources: ${REFS.join(", ")}`;

  // 1 + 3: one Claude call writes both the case study and the post copy (skipped once both markers exist).
  const needCS = !has(CS, M("draft")), needLI = !has(LI, M("linkedin"));
  if (ctx.dry) {
    if (needCS) out.push({ type: "linear", what: `${csI.identifier} case study DRAFT comment (1 Claude call)`, link: "(dry)" });
    if (needLI) out.push({ type: "linear", what: `${liI.identifier} LinkedIn copy comment, ${ok ? "approved" : "WAITING"}`, link: "(dry)" });
  } else if (needCS || needLI) {
    const w = await askJSON({
      effort: "low", schema: Out,
      system: `You are ${p.signature}. Use ONLY facts written in the sources. No invented metrics, numbers, quotes, names, dates or results.
caseStudy: a short Bayview Freight case-study draft (markdown) with sections Problem, What was done, Current status. Current status must say
plainly that cam 2 is better but cam 5 is still bad and being reworked. No spin, no claim it is solved. Where a customer quote would go, write [QUOTE: Bayview to provide].
linkedinPost: short LinkedIn post copy about the Bayview night-shift work, honest about the open cam 5 issue, with [CLIP: 30s night-shift clip from Wei Lin] where the video goes. No hashtag spam.
sources: refs you used.`,
      content: [{ type: "text", text: `Sources:\n${cited}` }],
    });
    for (const [key, issue, m, title, body] of [
      [CS, csI, M("draft"), "**DRAFT, not public until Bayview approves.** Bayview case study, drafted by " + p.aiName, w.caseStudy],
      [LI, liI, M("linkedin"), `**${gate}**\nLinkedIn post copy (Mon 26 Oct), drafted by ${p.aiName}`, w.linkedinPost],
    ]) {
      if (has(key, m)) continue;
      const flags = honesty(m, body, [], `${cited} ${atText}`);
      const text = flags.length
        ? `**${p.aiName} held this back** (honesty check failed, nothing posted):\n${flags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.`
        : `${title}\n\n${body}\n\n${srcLine}`;
      const r = await comment(ctx.info[key].id, `${text}${ctx.note(OWNER)}\n\nmarker: ${m}`);
      out.push({ type: "linear", what: `${issue.identifier} ${key === CS ? "case study DRAFT" : `LinkedIn copy (${ok ? "approved" : "WAITING"})`}`, link: r.url, ...(flags.length && { held: true }) });
    }
  }

  // 2: approval request to Lisa as a ✅ draft. Skip if an equivalent draft already exists (drafts store or issue comments).
  const dId = `email:${CS}`;
  const equivalent = listDrafts().some((d) => d.obligationKey === CS || d.id === dId)
    || (ctx.info[CS]?.comments ?? []).some((c) => c.body.includes(workMarker(ctx.open.find((o) => o.key === CS) ?? { key: CS, ai_can_do: "" })) || c.body.includes(`marker: ${M("approval")}`));
  if (!equivalent) {
    const text = `Hi Lisa,\n\nThis is ${p.aiName}, an AI assistant writing on behalf of ${p.name}.\n\nThank you for offering to review the Bayview case study. The draft is here for your review; nothing goes public until Bayview approves it.\n\nPhotos we plan to use:\n[PHOTOS: Priya to list]\n\nWe are also planning a LinkedIn post with a short night-shift clip, which would also only go out with Bayview's approval.\n\nCould you let us know if the draft and photos are OK, or what you would like changed?`;
    const flags = honesty(dId, text, [LISA], cited);
    if (flags.length) throw new Error(`approval email failed honesty: ${flags.join("; ")}`);
    if (ctx.dry) out.push({ type: "draft", what: `${dId} approval request to ${LISA} (with [PHOTOS: Priya to list])`, link: "(dry)" });
    else {
      const d = addDraft({ id: dId, personId: OWNER, obligationKey: CS, payload: { personId: OWNER, intendedTo: [LISA], cc: [], subject: "Bayview case study draft for your approval", text, marker: dId } });
      const quote = text.split("\n").map((l) => `> ${l}`).join("\n");
      const s = await say(OWNER, `✉️ Draft to ${LISA}: *${d.payload.subject}*\n${quote}\nThe case study draft is on ${link(csI)}. The photo list is a placeholder because the pack has none: Priya must fill [PHOTOS: Priya to list] first, the ✅ is refused until then.\n${srcLine} · ${link(csI)}\n✅ send · ❌ discard`, `[draft:${dId}]`, ctx.note(OWNER));
      if (!d.slack) setSlack(dId, { channel: s.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
      await comment(ctx.info[CS].id, `**${p.aiName} drafted the approval request to Lisa** (not sent, waiting for Priya's :white_check_mark: and the photo list): ${s.permalink}\n\nmarker: ${M("approval")}`);
      if (!s.existed) out.push({ type: "draft", what: `${dId} approval request to Lisa posted for ✅`, link: s.permalink });
    }
  }

  // 3b: only with a source showing Bayview approved: tell #handover it's ready. Never publish (no LinkedIn connection).
  if (ok) {
    const mk = `[${M("ready")}:${ctx.mode}]`;
    if (ctx.dry) out.push({ type: "slack", what: `LinkedIn copy ready to publish (approval ${ok.ref})`, link: "(dry)" });
    else {
      const s = await say(OWNER, `LinkedIn post copy is *ready to publish*: Bayview approval in ${ok.ref}. Copy: ${link(liI)}. I have NOT published it: there is no LinkedIn connection, so Priya posts it by hand once the 30s clip from Wei Lin is in.`, mk, ctx.note(OWNER));
      if (!s.existed) out.push({ type: "slack", what: "LinkedIn copy ready to publish (not published: no LinkedIn connection)", link: s.permalink });
    }
  }
  return out;
}

if (import.meta.filename === process.argv[1]) await scenarioCli(run);
