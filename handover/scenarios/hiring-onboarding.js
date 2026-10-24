// Scenario 5 "Hiring" (PDF row 5). The work pack has no take-homes or candidates, only an accepted hire (Jordan Lee, C04)
// who starts Monday with nothing set up. So: C04's checklist as Linear sub-issues under the onboarding issue, a welcome
// email draft from Wei Lin's AI for ✅, and one comment saying "advance or decline" doesn't apply. No Claude calls.
// node handover/scenarios/hiring-onboarding.js [--dry] [--now ISO]
import { requireEnv } from "../../kit/env.js";
import { comment, ensureLabels } from "../../kit/linear.js";
import { ensureChannels, findMessage } from "../../kit/slack.js";
import { addDraft, setSlack } from "../drafts.js";
import { PERSONAS, CHANNELS, LINEAR_TEAM_KEY } from "../personas.js";
import { say, link, honesty, citedText } from "../work.js";
import { scenarioCli } from "./index.js";

export const id = "hiring-onboarding";
export const scenario = 5;
const CLI = import.meta.filename === process.argv[1];
const KEY = "jordan-onboarding", OWNER = "weilin", DUE = "2026-10-26"; // C04: "starts Monday 26 Oct, 9am Austin"
const JORDAN = "jordan.lee@mail.example"; // E06
// One item per thing named in C04. Owners by role (team.json owns): onboarding -> weilin, approvals and payments -> sam.
const CHECKLIST = [
  ["Create Slack account", "weilin"], ["Create Linear account", "weilin"], ["Create email account", "weilin"],
  ["Laptop", "sam"], ["First task", "weilin"], ["Buddy intro: Wei Lin", "weilin"],
];
const NA = "No take-homes or candidates in the work pack. The hiring flow here is onboarding the accepted hire.";

async function gql(query, variables = {}) {
  const { LINEAR_API_KEY } = requireEnv("LINEAR_API_KEY");
  const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`linear: ${j.errors[0].message}`);
  if (!res.ok) throw new Error(`linear ${res.status}: ${res.statusText}`);
  return j.data;
}
async function teamId() {
  const d = await gql(`query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key } } }`, { key: LINEAR_TEAM_KEY });
  const t = d.teams.nodes.find((t) => t.key === LINEAR_TEAM_KEY);
  if (!t) throw new Error(`no Linear team with key ${LINEAR_TEAM_KEY}`);
  return t.id;
}
async function children(parentId) {
  const d = await gql(`query($id: String!) { issue(id: $id) { team { key } children(first: 100) { nodes { id identifier title url } } } }`, { id: parentId });
  if (d.issue.team.key !== LINEAR_TEAM_KEY) throw new Error(`refusing to touch an issue outside ${LINEAR_TEAM_KEY}`);
  return d.issue.children.nodes;
}

export async function run(ctx) {
  const o = ctx.open.find((x) => x.key === KEY || x.linear_ids?.includes("ZAP-130"));
  if (!o) return [{ type: "linear", what: "no open onboarding obligation (ZAP-130) in the ledger; nothing to do", link: "" }];
  const issue = { ...ctx.issueOf[o.key], id: ctx.info[o.key].id }, p = PERSONAS[OWNER], effects = [];
  const cited = citedText(["C04", "S06", "E06", "K03"], ctx.byRef);
  const citedAll = `${cited} ${["C04", "S06", "E06", "K03"].map((r) => ctx.byRef[r]?.at ?? "").join(" ")}`;

  // 1. Checklist as sub-issues (any time, no shift needed). Deduped by title among the parent's children.
  const have = await children(issue.id);
  const flags = honesty("checklist", `due ${DUE}`, [], citedAll);
  if (flags.length) throw new Error(flags.join("; "));
  const missing = CHECKLIST.filter(([t]) => !have.some((c) => c.title === t));
  if (ctx.dry) for (const [t, who] of missing) effects.push({ type: "linear", what: `sub-issue "${t}" [${PERSONAS[who].label}] due ${DUE} under ${issue.identifier}`, link: "(dry)" });
  else if (missing.length) {
    const labels = await ensureLabels(), tid = await teamId();
    for (const [title, who] of missing) {
      const r = await gql(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { issue { id identifier title url } } }`, { i: {
        teamId: tid, parentId: issue.id, title, dueDate: DUE, labelIds: [labels[PERSONAS[who].label], labels["AI-handover"]],
        description: `From C04 (Granola call). Created by ${p.aiName}.` } });
      have.push(r.issueCreate.issue);
      effects.push({ type: "linear", what: `sub-issue ${r.issueCreate.issue.identifier} "${title}" [${PERSONAS[who].label}] under ${issue.identifier}`, link: r.issueCreate.issue.url });
    }
  }
  if (CLI) for (const c of have.filter((c) => CHECKLIST.some(([t]) => t === c.title))) console.log(`  checklist: ${c.identifier} ${c.title} ${c.url}`);

  // 3. "Advance or decline for the founder" doesn't apply: say so once, so nobody thinks it was forgotten.
  const naMarker = `marker: scn:${id}:no-candidates`;
  if (!ctx.info[o.key].comments.some((c) => c.body.includes(naMarker))) {
    if (ctx.dry) effects.push({ type: "linear", what: `comment on ${issue.identifier}: ${NA}`, link: "(dry)" });
    else effects.push({ type: "linear", what: `comment on ${issue.identifier}: advance/decline not applicable`, link: (await comment(issue.id, `**${p.aiName}:** ${NA}\n\n${naMarker}`)).url });
  }

  // 2. Welcome email to Jordan as Wei Lin's AI: a draft for ✅. Needs Wei Lin on shift (unless dry).
  const draftId = `scn:${id}:welcome`, slackMarker = `[draft:${draftId}]`;
  const subject = "Welcome to Zapdos: your first day on Monday 26 Oct";
  const text = [`Hi Jordan,`, ``,
    `This is ${p.aiName}, an AI assistant writing on behalf of ${p.name}. Sorry the first-day details didn't reach you before the weekend.`, ``,
    `- Start: Monday 26 Oct, 9am Austin time.`, `- Where to go at 9am: [LOCATION: Sam to confirm]`,
    `- Your buddy: Wei Lin, our engineer in Singapore.`,
    `- Daily stand-up: 19:00 CT (Austin time) in a Slack huddle, weekdays.`,
    `- Accounts: your Slack, Linear and email accounts are being set up; logins will follow by email. Your laptop and first task are being arranged too.`, ``,
    `Looking forward to having you on the team.`].join("\n");
  const hflags = honesty("welcome email", `${subject}\n${text}`, [JORDAN], citedAll);
  if (hflags.length) {
    const r = await comment(issue.id, `**${p.aiName} held back the welcome email** (honesty check failed):\n\n${hflags.map((f) => `- ${f}`).join("\n")}\n\nA human should do this one.\n\nmarker: scn:${id}:welcome-held`);
    return [...effects, { type: "linear", what: "welcome email held back (honesty)", link: r.url, held: true }];
  }
  if (ctx.dry) {
    if (!(await findMessage(CHANNELS.handover, slackMarker))) effects.push({ type: "draft", what: `welcome email to ${JORDAN} for ✅ in #handover (placeholder [LOCATION: Sam to confirm])`, link: "(dry)" });
    return effects;
  }
  if (!ctx.onShift(OWNER)) return effects;
  const payload = { personId: OWNER, intendedTo: [JORDAN], cc: [], subject, text, marker: draftId };
  const d = addDraft({ id: draftId, personId: OWNER, obligationKey: o.key, payload });
  const quote = d.payload.text.split("\n").map((l) => `> ${l}`).join("\n");
  const s = d.slack ?? (await say(OWNER, `Draft for ${JORDAN}: *${subject}*\n${quote}\nSources: C04, S06, E06, K03 · ${link(issue)}\nHas a placeholder ([LOCATION: Sam to confirm]): fill it in before :white_check_mark:. React :white_check_mark: to send, :x: to discard.\n[scn:${id}:welcome:${ctx.mode}]`, slackMarker, ctx.note(OWNER)));
  if (!d.slack) setSlack(draftId, { channel: s.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
  if (!d.slack && !s.existed) effects.push({ type: "draft", what: `welcome email to ${JORDAN} posted for ✅`, link: s.permalink });
  const cm = `marker: scn:${id}:welcome-draft`;
  if (!ctx.info[o.key].comments.some((c) => c.body.includes(cm))) {
    const r = await comment(issue.id, `**${p.aiName} drafted a welcome email to Jordan** (not sent, waiting for a :white_check_mark: in Slack; [LOCATION: Sam to confirm] must be filled first): ${s.permalink}\n\nSources: C04, S06, E06, K03\n\n${cm}`);
    effects.push({ type: "linear", what: `comment on ${issue.identifier}: welcome email draft`, link: r.url });
  }
  return effects;
}

if (CLI) await scenarioCli(run);
