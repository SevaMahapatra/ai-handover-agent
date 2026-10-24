// CONTRACT: drafts the AIs prepared but that need a human ✅ before they go out. state/drafts.json (restart-safe).
// Draft: { id, personId, kind: "email", obligationKey, payload: <sendEmail args>, slack: { channel, ts, permalink } | null,
//          status: "pending" | "sent" | "discarded", result?: { messageId, gmailUrl }, createdAt, updatedAt }
// Worker (handover/run.js): addDraft(...) then setSlack(id, postAs result), with "[draft:<id>]" in the Slack text.
// Listener (handover/listen.js): reaction ✅ (white_check_mark) on that Slack message -> findBySlackTs -> sendEmail(payload) -> markDraft(id, "sent", result).
import fs from "node:fs";

export const DRAFTS = "state/drafts.json";
const load = () => (fs.existsSync(DRAFTS) ? JSON.parse(fs.readFileSync(DRAFTS, "utf8")) : []);
const save = (all) => (fs.mkdirSync("state", { recursive: true }), fs.writeFileSync(DRAFTS, JSON.stringify(all, null, 2)));

export const listDrafts = (status) => load().filter((d) => !status || d.status === status);
export const getDraft = (id) => load().find((d) => d.id === id) ?? null;
export const findBySlackTs = (ts) => load().find((d) => d.slack?.ts === ts) ?? null;

// Idempotent on id: returns the existing draft if it's already there.
export function addDraft({ id, personId, kind = "email", obligationKey, payload }) {
  const all = load();
  const existing = all.find((d) => d.id === id);
  if (existing) return existing;
  const d = { id, personId, kind, obligationKey, payload, slack: null, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  all.push(d);
  save(all);
  return d;
}

function patch(id, fields) {
  const all = load();
  const d = all.find((x) => x.id === id);
  if (!d) throw new Error(`no draft ${id}`);
  Object.assign(d, fields, { updatedAt: new Date().toISOString() });
  save(all);
  return d;
}
export const setSlack = (id, slack) => patch(id, { slack });
export const markDraft = (id, status, result) => patch(id, { status, ...(result && { result }) });
