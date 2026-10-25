// Slack Socket Mode listener: the one start command for the live demo. No SDK (Node 24 global WebSocket).
// node handover/listen.js
//   startup -> runCycle("startup"), then runCycle("timer") every CYCLE_MINUTES (default 5). Cycles never overlap.
//   #drops message   -> work_pack/drops/slack-<ts>.json, :eyes:, runCycle("drop"), lead replies with the changes in-thread
//   @mention / DM    -> lead answers from state/ledger.json only, citing refs
//   ✅ / ❌ reaction on a draft -> send it / discard it (handover/drafts.js)
// export async function handleEvent(event)  -> drive it without a socket.
import fs from "node:fs";
import { z } from "zod";
import { requireEnv, cli } from "../kit/env.js";
import { postAs, ensureChannels } from "../kit/slack.js";
import { sendEmail } from "../kit/email.js";
import { runCycle } from "./run.js";
import { findBySlackTs, markDraft } from "./drafts.js";
import { onQueueReaction, onQueueReply, setQueueCycle, queueDraftFor, queueItemFor } from "./queue.js";
import { CHANNELS } from "./personas.js";
import { LEDGER } from "./dispatch.js";
import { askJSON } from "../vision/claude.js";

const DROPS_DIR = process.env.DROPS_DIR || "work_pack/drops";
const log = (type, what, link = "") => console.log(`[${new Date().toISOString()}] ${type}: ${what}${link ? ` ${link}` : ""}`);

// Same form-vs-JSON rule as kit/slack.js: read methods ignore JSON bodies.
async function slack(method, body = {}, token) {
  token ??= requireEnv("SLACK_BOT_TOKEN").SLACK_BOT_TOKEN;
  const form = /^(conversations\.(list|history|replies)|chat\.getPermalink|users\.info|auth\.test)$/.test(method);
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8" },
    body: form ? new URLSearchParams(clean) : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
  if (!j.ok) throw new Error(`slack ${method}: ${j.error}${j.needed ? ` (needed: ${j.needed})` : ""}`);
  return j;
}

let botUserId, chans;
const me = async () => (botUserId ??= (await slack("auth.test")).user_id);
const channels = async () => (chans ??= await ensureChannels([CHANNELS.handover, CHANNELS.drops]));

// ---- serialized cycles: one promise chain, never two at once ----
let chain = Promise.resolve();
export function queueCycle(reason) {
  const p = chain.then(async () => {
    const r = await runCycle({ reason, now: new Date() });
    const touched = (r.issues ?? []).filter((x) => x.action !== "unchanged").length;
    log("cycle", `(${r.reason}) at ${r.now}: ${r.changes.length} changes, ${touched} issues touched, ${r.posted.length} posts, ${r.drafts.length} drafts, ${r.handovers.length} handovers`);
    return r;
  });
  chain = p.catch((e) => log("cycle.error", `(${reason}) ${e.stack ?? e}`));
  return p;
}
setQueueCycle(queueCycle); // the decision queue (handover/queue.js) kicks a cycle after each tap/answer

// ---- event handlers ----
async function userName(id) {
  try {
    const u = (await slack("users.info", { user: id })).user;
    return u.real_name || u.name || id;
  } catch {
    return id;
  }
}

async function onDrop(ev) {
  fs.mkdirSync(DROPS_DIR, { recursive: true });
  const file = `${DROPS_DIR}/slack-${ev.ts}.json`;
  if (fs.existsSync(file)) return log("drop", `already handled ${file}, skipped`);
  const from = `${await userName(ev.user)} in #drops`;
  fs.writeFileSync(file, JSON.stringify([{ kind: "slack-drop", at: new Date(parseFloat(ev.ts) * 1000).toISOString(), from, text: ev.text }], null, 2));
  log("drop", `wrote ${file}`);
  await slack("reactions.add", { channel: ev.channel, timestamp: ev.ts, name: "eyes" }).catch((e) => log("drop.react.error", e.message));
  const r = await queueCycle("drop");
  const changes = r.changes ?? [];
  const keys = new Set(changes.map((c) => c.key));
  const issues = (r.issues ?? []).filter((i) => i.action !== "unchanged" || keys.has(i.key));
  const lines = changes.length ? changes.map((c) => `- ${c.key}: ${c.what_changed} [${(c.sources ?? []).join(", ")}]`) : ["No changes to anyone's work."];
  if (issues.length) lines.push("", "Linear:", ...issues.map((i) => `- <${i.url}|${i.identifier}> (${i.action})`));
  const reply = await postAs("lead", ev.channel, `Drop read. ${lines.join("\n")}`, { thread_ts: ev.ts });
  log("drop.replied", `${changes.length} changes, ${issues.length} Linear issues`, reply.permalink);
  return reply;
}

const Answer = z.object({ answer: z.string(), sources: z.array(z.string()) });
const QA_SYSTEM = `You are the Handover Lead AI, answering a teammate's question in Slack.
Answer ONLY from the ledger given (obligations and conflicts). Cite the source refs (C01, E03, S05, D01, ZAP-102...) that back the answer, taken from the ledger's "sources" fields.
If the answer isn't in the ledger, answer exactly "I don't have that in the ledger" and return no sources. Never invent a price, date, name, or commitment. Keep it short, Slack-friendly.`;

async function onQuestion(ev) {
  const question = (ev.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim();
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const valid = new Set(ledger.source_refs ?? []);
  const r = await askJSON({
    system: QA_SYSTEM,
    schema: Answer,
    effort: "low",
    max_tokens: 2000,
    content: [{ type: "text", text: `Ledger:\n${JSON.stringify({ obligations: ledger.obligations, conflicts: ledger.conflicts })}\n\nQuestion: ${question}` }],
  });
  const refs = [...new Set(r.sources)].filter((s) => valid.has(s));
  const text = `${r.answer}${refs.length ? `\nSources: ${refs.join(", ")}` : ""}`;
  const reply = await postAs("lead", ev.channel, text, { thread_ts: ev.thread_ts ?? ev.ts });
  log("question.answered", `"${question.slice(0, 60)}" -> ${refs.length} refs`, reply.permalink);
  return { ...reply, text };
}

async function onReaction(ev) {
  const ts = ev.item?.ts;
  if (await onQueueReaction(ev)) return;
  const tap = ["white_check_mark", "x"].includes(ev.reaction);
  // A ✅/❌ always gets an answer in Slack: silence looks like the AI is stuck.
  const qi = queueItemFor(ts);
  if (tap && qi?.[1].kind === "input" && !findBySlackTs(ts)) {
    const [, it] = qi;
    const reply = await postAs("sam", it.channel, `${it.n}. *${it.title}* needs a value from Sam, so a tap can't complete it. Reply in this thread with \`${it.n}: <the value>\` and the drafts fill in from your reply.`, { thread_ts: it.header_ts });
    return log("queue.input-tap", `${qi[0]}: told Sam to reply with the value`, reply.permalink);
  }
  const q = ts && !findBySlackTs(ts) ? queueDraftFor(ts) : null; // ✅ on a decision-queue "send" item -> this same draft path
  const d = ts && (findBySlackTs(ts) ?? q?.draft);
  if (!d) return log("reaction", `:${ev.reaction}: on ${ts}: not a draft, ignored`);
  if (d.status !== "pending") {
    if (!tap) return log("reaction", `:${ev.reaction}: on draft ${d.id}: already ${d.status}, ignored`);
    const why = d.status === "discarded" ? "This draft was retired (a newer draft replaces it), so nothing was sent." : `This draft was already ${d.status}${d.result?.gmailUrl ? `: ${d.result.gmailUrl}` : "."}`;
    const reply = await postAs(d.personId, d.slack?.channel ?? ev.item.channel, why, { thread_ts: q?.thread_ts ?? ts });
    return log("draft.not-pending", `${d.id}: ${d.status}`, reply.permalink);
  }
  const channel = d.slack?.channel ?? ev.item.channel;
  const thread = q?.thread_ts ?? ts;
  if (ev.reaction === "white_check_mark") {
    // Drafts can carry placeholders like [PRICE: Sam to decide]; never send those, a human has to fill them in first.
    const p = d.payload;
    const holes = [...new Set(JSON.stringify([p.intendedTo, p.cc, p.subject, p.text]).match(/\[[A-Z][A-Z _/-]*:[^\]]*\]/g) ?? [])];
    if (holes.length) {
      const reply = await postAs(d.personId, channel, `Not sent: this draft still has placeholders a human must fill first: ${holes.join(" ")}`, { thread_ts: thread });
      log("draft.blocked", `${d.id}: ${holes.join(" ")}`, reply.permalink);
      return reply;
    }
    const result = await sendEmail(d.payload);
    markDraft(d.id, "sent", result);
    const reply = await postAs(d.personId, channel, `Sent :white_check_mark: ${result.gmailUrl}`, { thread_ts: thread });
    log("draft.sent", `${d.id} as ${d.personId} ${result.gmailUrl}`, reply.permalink);
    return reply;
  }
  if (ev.reaction === "x") {
    markDraft(d.id, "discarded");
    const reply = await postAs(d.personId, channel, "Discarded.", { thread_ts: thread });
    log("draft.discarded", d.id, reply.permalink);
    return reply;
  }
  log("reaction", `:${ev.reaction}: on draft ${d.id}: not ✅/❌, ignored`);
}

const IGNORED_SUBTYPES = new Set(["bot_message", "message_changed", "message_deleted"]);

export async function handleEvent(ev) {
  try {
    if (!ev || ev.bot_id || IGNORED_SUBTYPES.has(ev.subtype)) return log(ev?.type ?? "event", "from a bot or an edit, ignored");
    const bot = await me();
    if (ev.user === bot) return log(ev.type, "from our own bot, ignored");
    if (ev.type === "app_mention") return await onQuestion(ev);
    if (ev.type === "reaction_added") return await onReaction(ev);
    if (ev.type === "message") {
      if (ev.channel_type === "im") return await onQuestion(ev);
      const { drops, handover } = await channels();
      if (ev.channel === handover && ev.thread_ts && ev.thread_ts !== ev.ts && !ev.subtype && (await onQueueReply(ev))) return;
      if (ev.channel === drops && !ev.subtype && !(ev.text ?? "").includes(`<@${bot}>`)) return await onDrop(ev);
      return log("message", `in ${ev.channel}: not a drop, ignored`);
    }
    log(ev.type, "unhandled, ignored");
  } catch (e) {
    log(`${ev?.type ?? "event"}.error`, String(e.stack ?? e));
  }
}

// ---- Socket Mode ----
function connect() {
  let retried = false;
  const retry = (why) => {
    if (retried) return;
    retried = true;
    log("socket", `${why}, reconnecting in 2s`);
    setTimeout(connect, 2000);
  };
  (async () => {
    const { SLACK_APP_TOKEN } = requireEnv("SLACK_APP_TOKEN");
    const res = await fetch("https://slack.com/api/apps.connections.open", { method: "POST", headers: { authorization: `Bearer ${SLACK_APP_TOKEN}` } });
    const j = await res.json();
    if (!j.ok) throw new Error(`slack apps.connections.open: ${j.error}`);
    const ws = new WebSocket(j.url);
    ws.addEventListener("message", (m) => {
      let f;
      try {
        f = JSON.parse(m.data);
      } catch {
        return log("socket", `bad frame ${String(m.data).slice(0, 100)}`);
      }
      if (f.type === "hello") return log("socket", "connected");
      if (f.type === "disconnect") {
        retried = true;
        log("socket", `disconnect (${f.reason}), reconnecting`);
        try { ws.close(); } catch {}
        return connect();
      }
      if (f.envelope_id) ws.send(JSON.stringify({ envelope_id: f.envelope_id }));
      if (f.type === "events_api" && f.payload?.event) handleEvent(f.payload.event);
    });
    ws.addEventListener("close", () => retry("closed"));
    ws.addEventListener("error", (e) => retry(`error ${e.message ?? e.type}`));
  })().catch((e) => retry(`connect failed: ${e.message}`));
}

if (import.meta.filename === process.argv[1]) {
  cli(async () => {
    requireEnv("SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"); // fail clearly before anything else
    const c = await channels();
    log("startup", `channels ${Object.entries(c).map(([n, id]) => `#${n}=${id}`).join(" ")}, bot ${await me()}`);
    process.on("unhandledRejection", (e) => log("unhandled.error", String(e?.stack ?? e)));
    connect();
    queueCycle("startup").catch(() => {});
    const mins = Number(process.env.CYCLE_MINUTES) || 5;
    setInterval(() => queueCycle("timer").catch(() => {}), mins * 60_000);
    log("startup", `timer cycle every ${mins} min`);
  });
}
