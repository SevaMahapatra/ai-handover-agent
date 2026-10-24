// FROM-SCRATCH RESET for a full pipeline test. Destructive, so it needs --yes.
//   node scripts/reset.js --yes
// - deletes every issue in Linear team ZAP (issueDelete moves it to Linear's trash) and never touches other teams
// - deletes only OUR bot's messages in #handover and #drops (other people's messages stay)
// - clears state/ (ledger, shifts, drafts, queue) but keeps state/listen.log
// Stop the supervisor first: two processes would race.
import fs from "node:fs";
import { requireEnv, cli } from "../kit/env.js";
import { LINEAR_TEAM_KEY } from "../handover/personas.js";

const { LINEAR_API_KEY, SLACK_BOT_TOKEN } = requireEnv("LINEAR_API_KEY", "SLACK_BOT_TOKEN");

async function gql(query, variables = {}) {
  const j = await (await fetch("https://api.linear.app/graphql", { method: "POST", headers: { authorization: LINEAR_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) })).json();
  if (j.errors) throw new Error(`linear: ${j.errors[0].message}`);
  return j.data;
}
async function slack(method, params) {
  const j = await (await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { authorization: `Bearer ${SLACK_BOT_TOKEN}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) })).json();
  if (!j.ok) throw new Error(`slack ${method}: ${j.error}`);
  return j;
}

cli(async () => {
  if (!process.argv.includes("--yes")) throw new Error("destructive: rerun with --yes (deletes ZAP issues, our bot's Slack posts, and state/)");
  if (fs.existsSync("state/supervisor.lock")) {
    const pid = Number(fs.readFileSync("state/supervisor.lock", "utf8"));
    try { process.kill(pid, 0); throw new Error(`supervisor is running (pid ${pid}); stop it first: taskkill /PID ${pid} /T /F`); } catch (e) { if (e.message.startsWith("supervisor")) throw e; }
  }

  // Linear: ZAP only.
  const { issues } = await gql(`query($k: String!) { issues(first: 250, filter: { team: { key: { eq: $k } } }) { nodes { id identifier team { key } } } }`, { k: LINEAR_TEAM_KEY });
  let n = 0;
  for (const i of issues.nodes) {
    if (i.team.key !== LINEAR_TEAM_KEY) continue;
    await gql(`mutation($id: String!) { issueDelete(id: $id) { success } }`, { id: i.id });
    n++;
  }
  console.log(`linear: deleted ${n} ${LINEAR_TEAM_KEY} issues (in Linear's trash)`);

  // Slack: our bot's own messages, top-level and thread replies.
  const me = await slack("auth.test", {});
  const chans = (await slack("conversations.list", { types: "public_channel", limit: "1000" })).channels.filter((c) => ["handover", "drops"].includes(c.name));
  for (const c of chans) {
    let deleted = 0;
    const hist = (await slack("conversations.history", { channel: c.id, limit: "1000" })).messages;
    for (const m of hist) {
      const replies = m.reply_count ? (await slack("conversations.replies", { channel: c.id, ts: m.ts, limit: "1000" })).messages.slice(1) : [];
      for (const r of [...replies, m])
        if (r.bot_id && (r.user === me.user_id || r.bot_profile?.app_id === me.app_id || r.bot_id === me.bot_id)) {
          await slack("chat.delete", { channel: c.id, ts: r.ts }).catch((e) => console.log(`  skip ${r.ts}: ${e.message}`));
          deleted++;
        }
    }
    console.log(`slack: deleted ${deleted} bot messages in #${c.name}`);
  }

  // State.
  for (const f of fs.existsSync("state") ? fs.readdirSync("state") : [])
    if (f !== "listen.log" && f !== "supervisor.lock") fs.rmSync(`state/${f}`, { recursive: true, force: true });
  console.log("state: cleared (kept listen.log)");
});
