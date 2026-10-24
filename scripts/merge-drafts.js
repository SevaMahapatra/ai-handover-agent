// Merge drafts created in builder worktrees into master's state/drafts.json, so ✅ in Slack finds them.
// node scripts/merge-drafts.js <worktree path>...   (keeps master's entry when the id already exists)
import fs from "node:fs";
const MAIN = "state/drafts.json";
const main = fs.existsSync(MAIN) ? JSON.parse(fs.readFileSync(MAIN, "utf8")) : [];
for (const wt of process.argv.slice(2)) {
  const f = `${wt}/state/drafts.json`;
  if (!fs.existsSync(f)) { console.log(`${wt}: no drafts`); continue; }
  const add = JSON.parse(fs.readFileSync(f, "utf8")).filter((d) => d.slack && !main.some((m) => m.id === d.id));
  main.push(...add);
  console.log(`${wt}: +${add.length} (${add.map((d) => d.id).join(", ") || "none new"})`);
}
fs.writeFileSync(MAIN, JSON.stringify(main, null, 2));
console.log(`${MAIN}: ${main.length} drafts`);
