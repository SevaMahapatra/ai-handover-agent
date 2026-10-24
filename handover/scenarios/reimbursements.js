// Scenario 9 "Reimbursements": matches the receipts and queues the payment. Human part: the founder taps approve.
// Before Sam's decision: a check comment on the issue (claim, receipts, amounts agree across sources, where approval sits).
// After a "decision" source says APPROVED for this item: comment "payment queued (test mode)", move the issue to Done,
// tell Wei Lin in #handover. DECLINED: comment and keep it open. Runs regardless of shift (it only reacts to Sam's decision).
import { requireEnv } from "../../kit/env.js";
import { comment } from "../../kit/linear.js";
import { honesty, say, citedText, linearIssue, link } from "../work.js";
import { LINEAR_TEAM_KEY } from "../personas.js";

export const id = "reimbursements";
export const scenario = 9;
let KEY = "weilin-reimbursement"; // resolved from pack id ZAP-160 in run()
const CLAIM_REFS = ["C10", "S09"];
const M = (what) => `scn:${id}:${what}`;

async function gql(query, variables) {
  const { LINEAR_API_KEY } = requireEnv("LINEAR_API_KEY");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`linear: ${j.errors[0].message}`);
  if (!res.ok) throw new Error(`linear ${res.status}: ${res.statusText}`);
  return j.data;
}
// Moves an issue of team ZAP (only) to that team's "Done" state. Returns true if it changed.
async function markDone(identifier) {
  const d = await gql(`query($id: String!) { issue(id: $id) { id state { name } team { key states { nodes { id name } } } } }`, { id: identifier });
  if (d.issue.team.key !== LINEAR_TEAM_KEY) throw new Error(`refusing to touch ${identifier} outside ${LINEAR_TEAM_KEY}`);
  if (d.issue.state.name === "Done") return false;
  const done = d.issue.team.states.nodes.find((s) => s.name === "Done");
  if (!done) throw new Error(`team ${LINEAR_TEAM_KEY} has no "Done" state`);
  await gql(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, { id: d.issue.id, s: done.id });
  return true;
}

export async function run(ctx) {
  KEY = (await import("./index.js")).keyFor(ctx, "ZAP-160", KEY);
  const ob = ctx.ledger.obligations.find((o) => o.key === KEY), ref = ctx.issueOf[KEY];
  if (!ob || !ref) return [{ type: "linear", what: `no ledger obligation / Linear issue for ${KEY}; nothing to do`, link: "" }];
  const issue = ctx.info[KEY] ?? (await linearIssue(ref.identifier));
  const has = (m) => issue.comments.some((c) => c.body.includes(`marker: ${m}`));
  const out = [];
  const amounts = Object.fromEntries(CLAIM_REFS.map((r) => [r, [...new Set(ctx.byRef[r]?.text.match(/\$\d+(,\d{3})*(\.\d+)?/g) ?? [])]]));
  const all = [...new Set(Object.values(amounts).flat())];
  const agree = all.length === 1 && CLAIM_REFS.every((r) => amounts[r].length === 1);
  const amount = agree ? all[0] : null;
  const decision = ctx.sources.filter((s) => /decision/.test(s.kind) && /\b(APPROVED|DECLINED)\b/.test(s.text) && /reimburs|\$640|Wei Lin/i.test(s.text))
    .sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1);
  const cited = `${citedText([...CLAIM_REFS, "ZAP-160"], ctx.byRef)}\n${decision ? citedText([decision.ref], ctx.byRef) : ""}`;

  // Posts a Linear comment (deduped by marker) after the honesty check; a failed check becomes a "held back" comment.
  const post = async (what, body) => {
    const m = M(what);
    if (has(m)) return;
    const flags = honesty(`${id}:${what}`, body, [], cited);
    const text = flags.length ? `**Sam's AI held this back** (honesty check failed):\n${flags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.` : body;
    const url = ctx.dry ? "(dry)" : (await comment(issue.id, `${text}\n\nmarker: ${m}`)).url;
    out.push({ type: "linear", what: `${ref.identifier} ${what}${ctx.dry ? `: ${text.split("\n")[0]}` : ""}`, link: url, ...(flags.length && { held: true }) });
  };

  const amtLine = agree
    ? `The amount matches in both sources (${CLAIM_REFS.join(" and ")} agree on ${amount}) ✓.`
    : `The amounts do NOT match: ${CLAIM_REFS.map((r) => `${r} says ${amounts[r].join(", ") || "no amount"}`).join("; ")}. A human must check.`;
  await post("check", `**Sam's AI (reimbursement check):** Claim: ${amount ?? "amount unclear"} (taxi + hotel, Harbor Point trip), from ${CLAIM_REFS.join(" + ")}. ` +
    `Receipts: none attached in the work pack. ${amtLine} Approval: in Sam's decision queue (one tap).`);
  if (!decision) return out;

  if (/\bDECLINED\b/.test(decision.text)) {
    await post("declined", `**Sam's AI:** Declined by Sam (decision ${decision.ref}). No payment queued; the issue stays open for Sam and Wei Lin to sort out.`);
    return out;
  }
  if (!agree) {
    await post("approved-mismatch", `**Sam's AI:** Approved by Sam (decision ${decision.ref}), but the amounts in the sources disagree, so no payment is queued. A human must confirm the amount.`);
    return out;
  }
  await post("approved", `**Sam's AI:** Approved by Sam (decision ${decision.ref}). Payment queued for Wei Lin: ${amount}. ` +
    `Test mode: no payment provider is connected, so a human pays it; nothing was paid by the AI.`);
  if (ctx.dry) out.push({ type: "linear", what: `${ref.identifier} move to Done`, link: "(dry)" });
  else if (await markDone(ref.identifier)) out.push({ type: "linear", what: `${ref.identifier} moved to Done`, link: ref.url });

  const msg = `Your ${amount} Harbor Point reimbursement was approved by Sam. Payment is queued (test mode, a human pays it). (${link(ref)}, decision ${decision.ref})`;
  const flags = honesty(`${id}:slack`, msg, [], cited);
  if (flags.length) return [...out, { type: "slack", what: `Wei Lin notice held back: ${flags.join("; ")}`, link: "", held: true }];
  if (ctx.dry) out.push({ type: "slack", what: `#handover as Wei Lin's AI: ${msg}`, link: "(dry)" });
  else {
    const s = await say("weilin", msg, `[${M("paid-notice")}:${ctx.mode}]`, ctx.note("weilin"));
    if (!s.existed) out.push({ type: "slack", what: "#handover: Wei Lin told the reimbursement is approved", link: s.permalink });
  }
  return out;
}

if (import.meta.filename === process.argv[1]) { const { scenarioCli } = await import("./index.js"); await scenarioCli(run); }
