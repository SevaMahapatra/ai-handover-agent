// Linear sync: seeds the work-pack issues into team ZAP and applies the ledger to them. Plain GraphQL fetch, no SDK.
// SAFETY: only ever reads/writes issues and labels of the team whose key === LINEAR_TEAM_KEY ("ZAP").
// node kit/linear.js   -> ensureLabels, seedPack, applyLedger(state/ledger.json), prints one line per issue
import fs from "node:fs";
import { requireEnv, cli } from "./env.js";
import { logKitEvent } from "./events.js";
import { PERSONAS, LINEAR_TEAM_KEY } from "../handover/personas.js";
import { loadSources } from "../handover/sources.js";

const PACK_ISSUES = "work_pack/work_pack/linear/issues.json";
const UNOWNED = "Unowned";
const AI = "AI-handover";
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
    // Older boards carried a "Source: work pack…" footer; issues not on the ledger (e.g. closed duplicates) keep just the note.
    if (issue?.description?.includes("Source: work pack linear/issues.json")) issue = await updateIssue(issue.id, { description: p.note ?? "" });
    if (!issue) {
      issue = await createIssue({
        title: `[${p.id}] ${p.title}`,
        description: p.note ?? "",
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

// Readable provenance: "Granola call: Northwind… (20 Oct, C01)" instead of bare refs. The ref stays for tracing.
const DMON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let byRefCache;
function sourceLabel(ref) {
  byRefCache ??= Object.fromEntries(loadSources().map((s) => [s.ref, s]));
  const s = byRefCache[ref];
  if (!s || s.kind === "linear") return null; // the issue itself
  const d = s.at && !isNaN(new Date(s.at)) ? `${new Date(s.at).getUTCDate()} ${DMON[new Date(s.at).getUTCMonth()]}, ` : "";
  const what = s.kind === "call" ? `Granola call: ${s.text.split("\n")[0]}`
    // "ken.ong" -> "Ken Ong": Linear auto-links ".ong"/".kim" as domains, which made every sync rewrite the description.
    : s.kind.startsWith("email") ? `Email ${s.kind === "email-sent" ? "sent by" : "from"} ${s.from.split("@")[0].split(/[._]/).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}`
    : s.kind === "slack" ? `Slack ${s.from.split(" in ")[1] ?? ""} (${s.from.split(" in ")[0]})`
    : s.kind === "whatsapp" ? `WhatsApp: ${s.from.split(" -> ")[0]}`
    : s.kind === "calendar" ? `Calendar: ${s.text.split(" 20")[0]}` : "New message";
  return `${what} (${d}${ref})`;
}

// The whole description is ours: the pack's original note (if any), then the handover context. No hidden markers.
function describe(o, due, packNote) {
  const based = o.sources.map(sourceLabel).filter(Boolean);
  return [packNote, `**Owed to:** ${o.owed_to}`, `**Due:** ${o.due ? o.due : `${due} (AI target: no deadline in the sources)`}`,
    `**Why:** ${o.why}`, `**Next step:** ${o.next_step}`, o.needs_human && `**Needs a human:** ${o.needs_human}`,
    based.length && `**Based on:** ${based.join(" · ")}`].filter(Boolean).join("\n\n");
}

// [AI] issues have no pack id, so remember which issue holds which obligation. Fallbacks for older boards:
// the old "ledger-key:" line, then the exact title.
const MAP = "state/linear-map.json";
const loadMap = () => (fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, "utf8")) : {});
const saveMap = (m) => (fs.mkdirSync("state", { recursive: true }), fs.writeFileSync(MAP, JSON.stringify(m, null, 2)));

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
  const out = [], map = loadMap();
  const notes = Object.fromEntries(JSON.parse(fs.readFileSync(PACK_ISSUES, "utf8")).map((p) => [p.id, p.note ?? ""]));
  for (const o of ledger.obligations) {
    const primary = seeded[o.linear_ids[0]];
    let cur = primary ? issues.find((i) => i.id === primary.id)
      : issues.find((i) => i.id === map[o.key]) ?? issues.find((i) => i.title.startsWith("[AI] ") && (i.description?.includes(`ledger-key: ${o.key}`) || i.title === `[AI] ${o.title}`));
    const curState = cur?.state.name;
    // Closing sticks: an issue a person or an AI moved to Done/Canceled is never reopened by a later sync.
    const state = ["Done", "Canceled"].includes(curState) ? curState
      : o.status === "done" ? "Done" : o.status === "open" && curState === "In Progress" ? "In Progress" : "Todo";
    const keep = (cur?.labels.nodes ?? []).map((l) => l.id).filter((id) => !ownerIds.has(id) && id !== labels[AI]);
    const due = o.due ?? cur?.dueDate ?? aiTarget();
    const want = {
      labelIds: [...keep, labels[PERSONAS[o.owner].label], labels[AI]],
      description: describe(o, due, primary ? notes[o.linear_ids[0]] : ""),
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
      if (!same && process.env.LINEAR_DEBUG) {
        const a = (cur.description ?? "").trim(), b = want.description, i = [...a].findIndex((c, k) => c !== b[k]);
        console.log(`[debug] ${cur.identifier} state ${curState}->${state} due ${cur.dueDate}->${due} labels ${[...want.labelIds].sort().join() === cur.labels.nodes.map((l) => l.id).sort().join()} desc@${i}: ${JSON.stringify(a.slice(i - 20, i + 40))} vs ${JSON.stringify(b.slice(i - 20, i + 40))}`);
      }
      if (!same) (cur = await updateIssue(cur.id, want)), (action = "updated");
    }
    for (const extra of o.linear_ids.slice(1).filter((id) => seeded[id]))
      await comment(seeded[extra].id, `${PERSONAS[o.owner].aiName}: this is covered by ${cur.identifier} (${cur.url}).\n\nmarker: link:${o.key}`);
    if (action !== "unchanged") logKitEvent(`linear.${action}`, `${action} ${cur.identifier} ${cur.title}`, { key: o.key, url: cur.url });
    if (!primary) map[o.key] = cur.id;
    out.push({ key: o.key, identifier: cur.identifier, url: cur.url, action });
  }
  saveMap(map);
  for (const f of ledger.linear_fixes ?? []) {
    if (!seeded[f.linear_id]) continue;
    await comment(seeded[f.linear_id].id, `AI-handover fix: ${f.fix}\n\nSources: ${f.sources.join(", ")}\n\nmarker: fix:${f.linear_id}`);
    // Duplicates get closed, so the board only shows real work. "Canceled", not "Duplicate":
    // Linear rejects the Duplicate state without a duplicate relation ("missing duplicate relation").
    if (/duplicate/i.test(f.fix)) {
      const canceled = (await team()).states.nodes.find((x) => x.name === "Canceled");
      const cur = issues.find((i) => i.id === seeded[f.linear_id].id);
      if (canceled && cur && cur.state.name !== canceled.name)
        await updateIssue(cur.id, { stateId: canceled.id }).catch((e) => logKitEvent("linear.error", `close duplicate ${cur.identifier}: ${e.message}`, {}));
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
    if (hit) return { url: hit.url, existed: true };
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
