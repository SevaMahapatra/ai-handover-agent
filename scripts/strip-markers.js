// One-time migration: move "marker: ..." lines out of existing ZAP comments into state/comment-index.json, and
// rewrite each comment without the line. Run with the supervisor stopped. Safe to rerun (already-clean comments are skipped).
import "dotenv/config";
import fs from "node:fs";
import { LINEAR_TEAM_KEY } from "../handover/personas.js";

const q = async (query, variables = {}) => {
  const j = await (await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: process.env.LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json();
  if (j.errors) throw new Error(`linear: ${j.errors[0].message}`);
  return j.data;
};
const IDX = "state/comment-index.json";
const idx = fs.existsSync(IDX) ? JSON.parse(fs.readFileSync(IDX, "utf8")) : {};
const MARK = /\n*^marker: (.+)$/m;

const issues = (await q(`query($k: String!) { issues(first: 250, filter: { team: { key: { eq: $k } } }) { nodes { id identifier team { key } } } }`, { k: LINEAR_TEAM_KEY })).issues.nodes;
let moved = 0;
for (const i of issues) {
  if (i.team.key !== LINEAR_TEAM_KEY) continue;
  const cs = (await q(`query($id: String!) { issue(id: $id) { comments(first: 250) { nodes { id body url } } } }`, { id: i.id })).issue.comments.nodes;
  for (const c of cs) {
    const m = c.body.match(MARK);
    if (!m) continue;
    idx[`${i.id}|${m[1].trim()}`] = c.url;
    await q(`mutation($id: String!, $b: String!) { commentUpdate(id: $id, input: { body: $b }) { success } }`, { id: c.id, b: c.body.replace(MARK, "").trimEnd() });
    moved++;
  }
}
fs.mkdirSync("state", { recursive: true });
fs.writeFileSync(IDX, JSON.stringify(idx, null, 2));
console.log(`moved ${moved} markers out of comments on ${issues.length} ${LINEAR_TEAM_KEY} issues -> ${IDX} (${Object.keys(idx).length} entries)`);
