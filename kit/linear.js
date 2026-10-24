// Linear sync: seeds the work-pack issues into team ZAP and applies the ledger to them. Plain GraphQL fetch, no SDK.
// SAFETY: only ever reads/writes issues and labels of the team whose key === LINEAR_TEAM_KEY ("ZAP").
// node kit/linear.js   -> ensureLabels, seedPack, applyLedger(state/ledger.json), prints one line per issue
import fs from "node:fs";
import { requireEnv, cli } from "./env.js";
import { logKitEvent } from "./events.js";
import { PERSONAS, LINEAR_TEAM_KEY } from "../handover/personas.js";

const PACK_ISSUES = "work_pack/work_pack/linear/issues.json";
const UNOWNED = "Unowned";
const AI = "AI-handover";
const START = "<!-- ledger:start -->";
const END = "<!-- ledger:end -->";
const ISSUE = `id identifier title url description dueDate state { name } labels { nodes { id name } }`;

async function gql(query, variables = {}) {
  const { LINEAR_API_KEY } = requireEnv("LINEAR_API_KEY");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { authorization: LINEAR_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`linear: ${j.errors[0].message}`);
  if (!res.ok) throw new Error(`linear ${res.status}: ${res.statusText}`);
  return j.data;
}

let teamCache;
async function team() {
  if (teamCache) return teamCache;
  const d = await gql(`query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key states { nodes { id name } } } } }`, { key: LINEAR_TEAM_KEY });
  const t = d.teams.nodes.find((t) => t.key === LINEAR_TEAM_KEY);
  if (!t) throw new Error(`no Linear team with key ${LINEAR_TEAM_KEY}`);
  return (teamCache = t);
}
const stateId = async (name) => {
  const s = (await team()).states.nodes;
  return (s.find((x) => x.name === name) ?? s.find((x) => x.name === "Backlog")).id;
};
async function teamIssues() {
  const d = await gql(`query($id: String!) { team(id: $id) { issues(first: 250) { nodes { ${ISSUE} } } } }`, { id: (await team()).id });
  return d.team.issues.nodes;
}
const createIssue = async (input) =>
  (await gql(`mutation($i: IssueCreateInput!) { issueCreate(input: $i) { issue { ${ISSUE} } } }`, { i: { teamId: (await team()).id, ...input } })).issueCreate.issue;
const updateIssue = async (id, input) =>
  (await gql(`mutation($id: String!, $i: IssueUpdateInput!) { issueUpdate(id: $id, input: $i) { issue { ${ISSUE} } } }`, { id, i: input })).issueUpdate.issue;

export async function ensureLabels() {
  const t = await team();
  const want = [...Object.values(PERSONAS).filter((p) => p.label).map((p) => [p.label, p.color]), [UNOWNED, "#95A2B3"], [AI, "#5E6AD2"]];
  const d = await gql(`query($id: String!) { team(id: $id) { labels(first: 250) { nodes { id name } } } }`, { id: t.id });
  const have = Object.fromEntries(d.team.labels.nodes.map((l) => [l.name, l.id]));
  for (const [name, color] of want) {
    if (have[name]) continue;
    const r = await gql(`mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { issueLabel { id } } }`, { i: { teamId: t.id, name, color } });
    have[name] = r.issueLabelCreate.issueLabel.id;
  }
  return Object.fromEntries(want.map(([n]) => [n, have[n]]));
}

export async function seedPack() {
  const labels = await ensureLabels();
  const existing = await teamIssues();
  const out = [];
  for (const p of JSON.parse(fs.readFileSync(PACK_ISSUES, "utf8"))) {
    let issue = existing.find((i) => i.title.startsWith(`[${p.id}] `));
    const created = !issue;
    if (!issue) {
      issue = await createIssue({
        title: `[${p.id}] ${p.title}`,
        description: `${p.note ?? ""}\n\nSource: work pack linear/issues.json (${p.id})`,
        dueDate: p.due ?? undefined,
        stateId: await stateId(p.status),
        labelIds: [labels[p.assignee ? PERSONAS[p.assignee].label : UNOWNED]],
      });
      logKitEvent("linear.seeded", `Seeded ${issue.identifier} ${issue.title}`, { packId: p.id, url: issue.url });
    }
    out.push({ packId: p.id, id: issue.id, identifier: issue.identifier, url: issue.url, created });
  }
  return out;
}

const block = (o, due) => [START, `**Owed to:** ${o.owed_to}`, `**Due:** ${o.due ? `${o.due} (from the sources)` : `${due} (AI target: no deadline in the sources)`}`,
  `**Why:** ${o.why}`, `**Next step:** ${o.next_step}`,
  `**AI can do:** ${o.ai_can_do ?? "-"}`, `**Needs human:** ${o.needs_human ?? "-"}`, `**Sources:** ${o.sources.join(", ")}`, `ledger-key: ${o.key}`, END].join("\n\n");

function withBlock(desc, o, due) {
  desc = desc ?? "";
  const a = desc.indexOf(START), b = desc.indexOf(END);
  const rest = a >= 0 && b > a ? desc.slice(0, a) + desc.slice(b + END.length) : desc;
  return `${rest.trim()}\n\n${block(o, due)}`.trim();
}

// No deadline in the sources -> a target 2 working days out, labelled "AI target" on the issue.
// Set once and then kept (existing dueDate wins), so it doesn't drift every day.
function aiTarget(from = new Date()) {
  const d = new Date(from);
  for (let n = 0; n < 2; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() % 6) n++; // skip Sat (6) and Sun (0)
  }
  return d.toISOString().slice(0, 10);
}

export async function applyLedger(ledger) {
  const labels = await ensureLabels();
  const seeded = Object.fromEntries((await seedPack()).map((s) => [s.packId, s]));
  const issues = await teamIssues();
  const ownerIds = new Set([...Object.values(PERSONAS).filter((p) => p.label).map((p) => labels[p.label]), labels[UNOWNED]]);
  const out = [];
  for (const o of ledger.obligations) {
    const primary = seeded[o.linear_ids[0]];
    let cur = primary ? issues.find((i) => i.id === primary.id) : issues.find((i) => i.title.startsWith("[AI] ") && i.description?.includes(`ledger-key: ${o.key}`));
    const curState = cur?.state.name;
    const state = o.status === "done" ? "Done" : o.status === "open" && curState === "In Progress" ? "In Progress" : "Todo";
    const keep = (cur?.labels.nodes ?? []).map((l) => l.id).filter((id) => !ownerIds.has(id) && id !== labels[AI]);
    const due = o.due ?? cur?.dueDate ?? aiTarget();
    const want = {
      labelIds: [...keep, labels[PERSONAS[o.owner].label], labels[AI]],
      description: withBlock(cur?.description, o, due),
      stateId: await stateId(state),
      dueDate: due,
    };
    let action = "unchanged";
    if (!cur) {
      cur = await createIssue({ title: `[AI] ${o.title}`, ...want });
      action = "created";
    } else {
      const same = curState === state && cur.dueDate === due && (cur.description ?? "").trim() === want.description &&
        [...want.labelIds].sort().join() === cur.labels.nodes.map((l) => l.id).sort().join();
      if (!same) (cur = await updateIssue(cur.id, want)), (action = "updated");
    }
    for (const extra of o.linear_ids.slice(1).filter((id) => seeded[id]))
      await comment(seeded[extra].id, `${PERSONAS[o.owner].aiName}: this is covered by ${cur.identifier} (${cur.url}).\n\nmarker: link:${o.key}`);
    if (action !== "unchanged") logKitEvent(`linear.${action}`, `${action} ${cur.identifier} ${cur.title}`, { key: o.key, url: cur.url });
    out.push({ key: o.key, identifier: cur.identifier, url: cur.url, action });
  }
  for (const f of ledger.linear_fixes ?? []) {
    if (!seeded[f.linear_id]) continue;
    await comment(seeded[f.linear_id].id, `AI-handover fix: ${f.fix}\n\nSources: ${f.sources.join(", ")}\n\nmarker: fix:${f.linear_id}`);
    // Duplicates get closed, so the board only shows real work.
    if (/duplicate/i.test(f.fix)) {
      const s = (await team()).states.nodes;
      const dup = s.find((x) => x.name === "Duplicate") ?? s.find((x) => x.name === "Canceled");
      const cur = issues.find((i) => i.id === seeded[f.linear_id].id);
      if (dup && cur?.state.name !== dup.name) await updateIssue(cur.id, { stateId: dup.id });
    }
  }
  return out;
}

export async function comment(issueId, body) {
  const marker = body.match(/^marker: .+$/m)?.[0];
  if (marker) {
    const d = await gql(`query($id: String!) { issue(id: $id) { team { key } comments(first: 250) { nodes { body url } } } }`, { id: issueId });
    if (d.issue.team.key !== LINEAR_TEAM_KEY) throw new Error(`refusing to comment outside team ${LINEAR_TEAM_KEY}`);
    const hit = d.issue.comments.nodes.find((c) => c.body.includes(marker));
    if (hit) return { url: hit.url };
  }
  const r = await gql(`mutation($i: CommentCreateInput!) { commentCreate(input: $i) { comment { url } } }`, { i: { issueId, body } });
  logKitEvent("linear.commented", `Comment on ${issueId}: ${body.slice(0, 60)}`, { url: r.commentCreate.comment.url });
  return { url: r.commentCreate.comment.url };
}

if (import.meta.filename === process.argv[1]) {
  cli(async () => {
    const before = (await teamIssues()).length;
    const labels = await ensureLabels();
    const seeded = await seedPack();
    const results = await applyLedger(JSON.parse(fs.readFileSync("state/ledger.json", "utf8")));
    const issues = await teamIssues();
    const names = new Set(Object.values(PERSONAS).filter((p) => p.label).map((p) => p.label).concat(UNOWNED));
    const ids = new Set([...seeded.map((s) => s.id), ...issues.filter((i) => i.title.startsWith("[AI] ")).map((i) => i.id)]);
    for (const i of issues.filter((i) => ids.has(i.id)).sort((a, b) => a.identifier.localeCompare(b.identifier, "en", { numeric: true })))
      console.log(`${i.identifier}  [${i.labels.nodes.find((l) => names.has(l.name))?.name ?? "-"}]  ${i.state.name}  ${i.title}  ${i.url}`);
    const n = (a) => results.filter((r) => r.action === a).length;
    console.log(`\n${seeded.filter((s) => s.created).length} seeded, ${n("created")} created, ${n("updated")} updated, ${n("unchanged")} unchanged` +
      ` (${Object.keys(labels).length} labels; ${LINEAR_TEAM_KEY} issues: ${before} before, ${issues.length} after)`);
  });
}
