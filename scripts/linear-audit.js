// Audit the ZAP board: every open issue should have an owner label, a due date, and a handover note.
// node scripts/linear-audit.js   (read-only; exit 1 if anything is missing)
import "dotenv/config";
import { LINEAR_TEAM_KEY } from "../handover/personas.js";

const q = async (query) => {
  const j = await (await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: process.env.LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query }) })).json();
  if (j.errors) throw new Error(`linear: ${j.errors[0].message}`);
  return j.data;
};
// Two passes: Linear rejects one query that nests issues -> comments ("Query too complex").
const d = await q(`{ issues(first:100, filter:{team:{key:{eq:"${LINEAR_TEAM_KEY}"}}}) { nodes { id identifier title dueDate state { type name } labels(first:10) { nodes { name } } } } }`);
const issues = d.issues.nodes.sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }));
await Promise.all(issues.map(async (i) => (i.comments = (await q(`{ issue(id:"${i.id}") { comments(first:100) { nodes { body } } } }`)).issue.comments)));
const OWNERS = ["Sam", "Wei Lin", "Dana", "Priya"];
let bad = 0;
for (const i of issues) {
  const closed = ["completed", "canceled"].includes(i.state.type);
  const owner = i.labels.nodes.map((l) => l.name).find((n) => OWNERS.includes(n)) ?? "-";
  const handovers = i.comments.nodes.filter((c) => c.body.includes("Handover from")).length;
  const miss = closed ? [] : [!i.dueDate && "due", !handovers && "handover", owner === "-" && "owner"].filter(Boolean);
  if (miss.length) bad++;
  console.log(`${miss.length ? "!!" : "ok"} ${i.identifier.padEnd(7)} ${i.state.name.padEnd(11)} due:${(i.dueDate ?? "-").padEnd(10)} handovers:${handovers} owner:${owner.padEnd(7)} ${i.title.slice(0, 50)}${miss.length ? `   MISSING: ${miss.join(", ")}` : ""}`);
}
console.log(`\n${issues.length} issues, ${bad} open issue(s) missing something`);
process.exit(bad ? 1 : 0);
