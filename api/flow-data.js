// GET /api/flow-data: what the workflow monitor (/api/flow) shows. Read-only: it only reads the logs the system writes.
// Sources: kit/out/events.json (Linear/Slack/Gmail actions), state/listen.log (drops, decisions, cycles), state/*.json.
import fs from "node:fs";

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// Map each raw event to a step of the workflow diagram.
function stepOf(type, text) {
  if (/^(drop|queue\.drop|queue\.answered)$/.test(type)) return "input";
  if (type === "cycle") return /[1-9]\d* changes/.test(text) ? "dispatch" : null;
  if (type === "drop.replied") return "dispatch";
  if (type.startsWith("linear.")) return /handover|Handover/.test(text) ? "shift" : "linear";
  if (type === "slack.card") return "cards";
  if (type === "slack.posted") return /decisions|qitem|Approved|Declined/.test(text) ? "decide" : /shift/.test(text) ? "cards" : "ai";
  if (/^queue\.(linear|replied|input-tap)$/.test(type) || type === "reaction") return "decide";
  if (/^draft\.(sent|blocked|not-pending|discarded)$/.test(type) || type === "email.sent") return "gmail";
  if (type === "question.answered") return "dispatch";
  return null;
}

export default function handler(req, res) {
  const events = [];
  for (const e of read("kit/out/events.json", []).slice(-400))
    events.push({ ts: e.ts, type: e.type, text: e.summary, link: e.data?.url ?? e.data?.permalink ?? e.data?.gmailUrl ?? "" });
  let log = "";
  try { log = fs.readFileSync("state/listen.log", "utf8").split("\n").slice(-600).join("\n"); } catch {}
  for (const line of log.split("\n")) {
    const m = line.match(/^\[([^\]]+)\] ([a-z.-]+): (.*?)(?: (https:\/\/\S+))?$/);
    if (!m || m[2] === "message" || m[2] === "supervisor" || m[2] === "startup") continue;
    events.push({ ts: m[1], type: m[2], text: m[3], link: m[4] ?? "" });
  }
  const out = events.map((e) => ({ ...e, step: stepOf(e.type, e.text) })).filter((e) => e.step)
    .sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 60);
  const shifts = read("state/shifts.json", {});
  const queue = Object.values(read("state/queue.json", {}));
  const drafts = read("state/drafts.json", []);
  const ledger = read("state/ledger.json", { obligations: [] });
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({
    now: new Date().toISOString(),
    events: out,
    shifts,
    counts: {
      obligations: ledger.obligations.length,
      sources: (ledger.source_refs ?? []).length,
      decisionsPending: queue.filter((q) => q.status === "pending").length,
      decisionsDone: queue.filter((q) => q.status !== "pending").length,
      draftsWaiting: drafts.filter((d) => d.status === "pending").length,
      draftsSent: drafts.filter((d) => d.status === "sent").length,
    },
  }));
}
