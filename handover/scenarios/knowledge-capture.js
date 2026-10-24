// Scenario 12 "Knowledge that walked out": Wei Lin's AI writes up how deploy alerts work from the alert emails + chat,
// as a Linear comment (runbook draft), then asks Wei Lin in #handover to check it once. The config file is NOT in the pack.
import { z } from "zod";
import { askJSON } from "../../vision/claude.js";
import { comment } from "../../kit/linear.js";
import { say, honesty, citedText } from "../work.js";
import { PERSONAS } from "../personas.js";
import { scenarioCli } from "./index.js";

export const id = "knowledge-capture";
export const scenario = 12;
const OWNER = "weilin", REFS = ["E11", "E12", "S07", "S08", "C10", "ZAP-161"];
const DOC_MARKER = "marker: scn:knowledge-capture:runbook-doc";

const findIssue = (ctx) => ctx.open.find((o) => o.key === "deploy-alerts-doc" || o.sources.includes("ZAP-161") && /alert/i.test(o.title));

// Facts come from the source text in code, each with its ref. Timestamps quoted exactly as the source writes them.
function facts(byRef) {
  const t = (r) => byRef[r]?.text ?? "", at = (r) => byRef[r]?.at ?? "";
  const f = { known: [], timeline: [], where: [] };
  const rule = t("E11").match(/Rule: (\S+) \(owner: (\w+)\)/), check = t("E11").match(/Check: ([^.\n]+)/);
  const mins = t("E12").match(/after (\d+) minutes/)?.[1];
  if (byRef.E11) f.known.push(`The alert email comes from ${byRef.E11.from} to ${t("E11").match(/To: (\S+)/)?.[1] ?? "?"} with subject "${t("E11").match(/Subject: (.+)/)?.[1]}" [E11]`);
  if (check) f.known.push(`The check is: ${check[1].trim()} [E11]`);
  if (byRef.E12) f.known.push(`A matching "${t("E12").match(/Subject: (.+)/)?.[1]}" email is sent when it comes back [E12]`);
  if (/Alex set them up/.test(t("S07"))) f.known.push(`Alex set the alerts up; Wei Lin asked how they are wired [S07]`);
  if (byRef.S08) f.known.push(`Dana doesn't know either: "${t("S08")}" [S08]`);
  if (/two weeks' leave/.test(t("C10"))) f.known.push(`Alex is on two weeks' leave; the team confirmed nobody knows the setup [C10]`);
  if (byRef.E11) f.timeline.push(`${at("E11")}: deploy-api DOWN alert [E11]`);
  if (byRef.E12) f.timeline.push(`${at("E12")}: deploy-api RECOVERED${mins ? ` after ${mins} minutes` : ""} [E12]`);
  if (byRef.S07) f.timeline.push(`${at("S07")}: Wei Lin asks in #deploys how the alerts are wired [S07]`);
  if (rule) f.where.push(`\`${rule[1]}\`, owner: ${rule[2]} (named in the alert email) [E11]`);
  return f;
}

const Phrase = z.object({ summary: z.string(), questions: z.array(z.string()) });

export async function run(ctx) {
  const o = findIssue(ctx);
  if (!o) return [];
  if (!ctx.dry && !ctx.onShift(OWNER)) return [];
  const p = PERSONAS[OWNER], issue = ctx.issueOf[o.key], info = ctx.info[o.key], out = [];
  const slackMarker = `[scn:knowledge-capture:runbook:${ctx.mode}]`;
  if (ctx.dry) return [{ type: "linear", what: `${issue.identifier} runbook draft "How deploy alerts work"`, link: "(dry)" },
    { type: "slack", what: `#handover ask Wei Lin to check it once ${slackMarker}`, link: "(dry)" }];

  let docUrl = info.comments.find((c) => c.body.includes(DOC_MARKER))?.url;
  if (!docUrl) {
    const f = facts(ctx.byRef), cited = `${citedText(REFS, ctx.byRef)} ${REFS.map((r) => ctx.byRef[r]?.at ?? "").join(" ")}`;
    const ph = await askJSON({ effort: "low", schema: Phrase,
      system: `You are ${p.signature}. Phrase a short runbook draft for ${p.name}. Use only the facts given; never add thresholds, recipients, dates, or tools that are not in them.`,
      content: [{ type: "text", text: `Facts:\n${[...f.known, ...f.timeline, ...f.where].join("\n")}\n\nGap: alerts/deploy.yaml itself is not in the work pack.\n\nReturn: summary (1-2 sentences, what this alert does) and 3-5 questions Wei Lin should verify by opening alerts/deploy.yaml.` }] });
    // Honesty per line: a line that fails is dropped, the rest of the doc still goes out.
    const dropped = [], ok = (l) => { const fl = honesty(o.key, l, [...l.matchAll(/[\w.]+@[\w.]+/g)].map((m) => m[0]), cited); if (fl.length) dropped.push(...fl); return !fl.length; };
    const sec = (title, lines) => `**${title}**\n${lines.filter(ok).map((l) => `- ${l}`).join("\n") || "- (nothing confirmed)"}`;
    const body = [`## How deploy alerts work (draft for Wei Lin to check once)`, `_Written by ${p.aiName}, an AI, from the alert emails and chat._`,
      // No model-written summary: it once added "the file has not been reviewed yet", which no source says. Facts below are code-assembled.
      sec("What we know", f.known), sec("Timeline of the 20 Oct incident", f.timeline), sec("Where the config lives", f.where),
      sec("What's NOT known", ["The config file isn't in the work pack, so the thresholds, recipients and escalation are unknown", "Alex is on leave per C10, so he can't be asked right now [C10]"]),
      sec("Questions for Wei Lin to verify", ph.questions),
      dropped.length ? `_Left out (honesty check): ${dropped.join("; ")}_` : "", `Sources: ${REFS.join(", ")}`, DOC_MARKER].filter(Boolean).join("\n\n");
    docUrl = (await comment(info.id, body)).url;
    out.push({ type: "linear", what: `${issue.identifier} runbook draft${dropped.length ? ` (${dropped.length} line(s) dropped by honesty)` : ""}`, link: docUrl });
  }
  const s = await say(OWNER, `Wrote down how deploy alerts work (from the alert emails + chat): <${docUrl}|${issue.identifier} runbook>. Wei Lin: check it once and tick :white_check_mark: on this message when it's right.`, slackMarker, ctx.note(OWNER));
  if (!s.existed) out.push({ type: "slack", what: "#handover asked Wei Lin to check the runbook once", link: s.permalink });
  return out;
}

if (import.meta.filename === process.argv[1]) await scenarioCli(run);
