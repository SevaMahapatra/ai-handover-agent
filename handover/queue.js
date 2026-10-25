// The founder's decision queue ("max 10 items a day, each one tap"). One header a day in #handover, one thread reply per decision.
// export async function postDecisionQueue({ ledger, issueOf, info, now, simulated, onShift })
//   ledger: state/ledger.json · issueOf: { key: {identifier, url} } · info: { key: {id, comments} } from Linear
//   onShift(personId) -> bool · returns [{ type: "slack", what, link }] for posts it created (empty when deduped)
// export async function onQueueReaction(event)   -> handled? (listener calls it for reaction_added before the drafts check)
// export async function onQueueReply(event)      -> handled? (listener calls it for thread replies in #handover)
// export function setQueueCycle(fn)              -> the listener hands over its queueCycle(reason) (avoids a circular import)
// export function queueDraftFor(ts)              -> { draft, thread_ts } when ts is a "send" item, so ✅ there uses the draft path
// Decisions become SOURCES: each tap or reply is written to work_pack/drops/decision-<ts>.json, so the next cycle's
// dispatcher update() records it with a citable ref (D..) and every AI carries on from it.
// Index: state/queue.json { key: { kind, ts, channel, status, n, header_ts, date, title, needs_human, owner, issue, issueId, permalink, draftId } }
// Slack threads are one level deep, so a reply "in an item's thread" lands in the header thread: "<n>: <value>" picks the item.
import fs from "node:fs";
import { requireEnv } from "../kit/env.js";
import { postAs, ensureChannels, hasMarker } from "../kit/slack.js";
import { comment } from "../kit/linear.js";
import { listDrafts, getDraft } from "./drafts.js";
import { PERSONAS, CHANNELS } from "./personas.js";
import { local } from "./shift.js";
import { say, link } from "./work.js";

export const FOUNDER = "sam";
export const MAX_ITEMS = 10;
export const QUEUE = "state/queue.json";
const DROPS_DIR = process.env.DROPS_DIR || "work_pack/drops";
const VALUE = /\b(price range|price|range|numbers?|amount|quote|slots?)\b/i;
const log = (type, what, l = "") => console.log(`[${new Date().toISOString()}] ${type}: ${what}${l ? ` ${l}` : ""}`);

const load = () => (fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, "utf8")) : {});
const save = (idx) => (fs.mkdirSync("state", { recursive: true }), fs.writeFileSync(QUEUE, JSON.stringify(idx, null, 2)));
const byTs = (ts) => Object.entries(load()).find(([, v]) => v.ts === ts);

let cycle = null;
export const setQueueCycle = (fn) => (cycle = fn);
const kick = (why) => (cycle ? cycle(why).catch(() => {}) : log("queue", `no cycle runner set, ${why} waits for the next timer`));

async function slackApi(method, body) {
  const { SLACK_BOT_TOKEN } = requireEnv("SLACK_BOT_TOKEN");
  const form = /^(conversations\.replies|chat\.getPermalink)$/.test(method); // read methods ignore JSON bodies
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SLACK_BOT_TOKEN}`, "content-type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8" },
    body: form ? new URLSearchParams(body) : JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`slack ${method}: ${j.error}`);
  return j;
}

// Today's items: founder-owned needs_human, other owners' needs_human naming Sam, and Sam's pending drafts (folded into their obligation).
function pickItems(ledger) {
  const open = ledger.obligations.filter((o) => o.status !== "done" && o.needs_human);
  const mine = open.filter((o) => o.owner === FOUNDER), theirs = open.filter((o) => o.owner !== FOUNDER && /\bSam\b/.test(o.needs_human));
  const drafts = listDrafts("pending").filter((d) => d.personId === FOUNDER || mine.some((o) => o.key === d.obligationKey));
  const items = [...mine, ...theirs].map((o) => ({ o, d: drafts.find((d) => d.obligationKey === o.key) }));
  for (const d of drafts.filter((d) => !items.some((i) => i.d === d))) {
    const o = ledger.obligations.find((x) => x.key === d.obligationKey);
    if (o && o.status !== "done") items.push({ o, d });
  }
  for (const i of items) i.kind = VALUE.test(i.o.needs_human ?? "") ? "input" : i.d ? "send" : "approve";
  const done = load();
  return items.filter((i) => !["approved", "answered"].includes(done[i.o.key]?.status))
    .sort((a, b) => (a.o.due ?? "9999").localeCompare(b.o.due ?? "9999")).slice(0, MAX_ITEMS);
}

export async function postDecisionQueue({ ledger, issueOf, info, now = new Date(), simulated = false, onShift }) {
  if (!onShift(FOUNDER)) return [];
  const items = pickItems(ledger).filter((i) => issueOf[i.o.key]);
  if (!items.length) return [];
  const p = PERSONAS[FOUNDER], when = local(now, p.tz), out = [];
  const sim = simulated ? `\n_(simulated clock: ${when.label})_` : "";
  const header = await say(FOUNDER, `*Sam's decisions today: ${items.length} of max ${MAX_ITEMS}.* Each one is ready: tap ✅ to approve or ❌ to decline. For the ones asking for a value, reply in this thread starting with its number (e.g. \`1: <value>\`).`,
    `[queue:${FOUNDER}:${when.date}${simulated ? ":sim" : ""}]`, sim, { top: true });
  if (!header.existed) out.push({ type: "slack", what: `decision queue header (${items.length} items)`, link: header.permalink });
  const channel = header.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover];
  const idx = load();
  let replies = null; // fetched once, only when the index doesn't already know an item under today's header (rebuild)
  for (const [n0, { o, d, kind }] of items.entries()) {
    const n = n0 + 1, marker = `[qitem:${o.key}]`, issue = issueOf[o.key];
    if (idx[o.key]?.header_ts === header.ts) continue;
    replies ??= (await slackApi("conversations.replies", { channel, ts: header.ts, limit: "200", include_all_metadata: "true" })).messages;
    const found = replies.find((m) => hasMarker(m, marker));
    const value = o.needs_human?.match(VALUE)?.[1]?.toLowerCase();
    const ready = kind === "send" ? `draft "${d.payload.subject}" to ${d.payload.intendedTo.join(", ")}` : o.needs_human;
    const action = { approve: "✅ approve / ❌ decline", input: `Reply in this thread with \`${n}: <the ${value}>\`, and the drafts fill in from your reply`, send: `✅ sends the draft ${d?.id}` }[kind];
    let msg;
    if (found) msg = { ts: found.ts, permalink: (await slackApi("chat.getPermalink", { channel, message_ts: found.ts })).permalink };
    else {
      msg = await postAs(FOUNDER, channel, `${n}. *${o.title}*: ${ready}. Due ${o.due ?? "no deadline in the sources"}. ${link(issue)}\n${action}${sim}\n${marker}`, { thread_ts: header.ts });
      out.push({ type: "slack", what: `decision ${n} (${kind}) ${o.key}`, link: msg.permalink });
    }
    idx[o.key] = { kind, ts: msg.ts, channel, status: "pending", n, header_ts: header.ts, date: when.date, title: o.title, needs_human: o.needs_human,
      owner: o.owner, issue: { identifier: issue.identifier, url: issue.url }, issueId: info[o.key]?.id ?? issue.identifier, permalink: msg.permalink, draftId: d?.id ?? null };
  }
  save(idx);
  return out;
}

function writeDrop(ts, from, text) {
  fs.mkdirSync(DROPS_DIR, { recursive: true });
  const file = `${DROPS_DIR}/decision-${ts}.json`;
  if (fs.existsSync(file)) return (log("queue.drop", `${file} exists, skipped`), file);
  fs.writeFileSync(file, JSON.stringify([{ kind: "decision", at: new Date().toISOString(), from, text }], null, 2));
  log("queue.drop", `wrote ${file}`);
  return file;
}

// ✅ / ❌ on an "approve" item. "send" items return false: the listener's draft path handles them via queueDraftFor().
export async function onQueueReaction(ev) {
  const hit = ev.item?.ts && byTs(ev.item.ts);
  if (!hit) return false;
  const [key, it] = hit;
  if (it.kind !== "approve" || !["white_check_mark", "x"].includes(ev.reaction)) return false;
  if (it.status !== "pending") return (log("queue.reaction", `${key} already ${it.status}, ignored`), true);
  const yes = ev.reaction === "white_check_mark", verb = yes ? "APPROVED" : "DECLINED";
  writeDrop(ev.item.ts, "Sam (one tap in the Slack decision queue)", `Sam ${verb}: ${it.title}. ${it.needs_human}`);
  const c = await comment(it.issueId, `${yes ? "Approved" : "Declined"} by Sam (one tap in Slack: ${it.permalink})\n\n${it.title}: ${it.needs_human}\n\nmarker: decision:${key}`);
  log("queue.linear", `${it.issue.identifier} ${verb}`, c.url);
  const reply = await postAs(FOUNDER, it.channel, `${yes ? "Approved ✅" : "Declined ❌"} Logged on ${link(it.issue)}. ${yes ? `${PERSONAS[it.owner].aiName} carries on from here.` : "The item stays open."}`, { thread_ts: it.header_ts });
  log("queue.replied", `${key} ${verb}`, reply.permalink);
  const idx = load();
  idx[key].status = yes ? "approved" : "declined";
  save(idx);
  kick(`decision ${key}`);
  return true;
}

export const queueItemFor = (ts) => (ts && byTs(ts)) || null; // [key, item] or null

export function queueDraftFor(ts) {
  const hit = ts && byTs(ts);
  if (!hit || hit[1].kind !== "send" || !hit[1].draftId) return null;
  const draft = getDraft(hit[1].draftId);
  return draft && { draft, thread_ts: hit[1].header_ts };
}

// A human reply on an "input" item (its own ts, or the header thread with "<n>: ..."). The value is quoted verbatim.
export async function onQueueReply(ev) {
  const text = ev.text ?? "", idx = load();
  let hit = Object.entries(idx).find(([, v]) => v.kind === "input" && v.ts === ev.thread_ts);
  const n = text.match(/^\s*#?(\d+)\s*[:.)-]/)?.[1];
  if (!hit && n) hit = Object.entries(idx).find(([, v]) => v.header_ts === ev.thread_ts && v.n === Number(n));
  if (!hit) return false;
  const [key, it] = hit;
  if (it.kind !== "input") {
    await postAs(FOUNDER, it.channel, `Item ${it.n} doesn't need a value: tap ✅ or ❌ on it instead.`, { thread_ts: it.header_ts });
    return true;
  }
  writeDrop(ev.ts, "Sam (reply in the Slack decision queue)", `Sam's answer for ${it.title}: ${text}`);
  await slackApi("reactions.add", { channel: ev.channel, timestamp: ev.ts, name: "eyes" }).catch((e) => log("queue.react.error", e.message));
  idx[key].status = "answered";
  save(idx);
  kick(`answer ${key}`);
  const reply = await postAs(FOUNDER, it.channel, "Got it. Recorded as a source; drafts will use your value next cycle.", { thread_ts: it.header_ts });
  log("queue.answered", `${key}`, reply.permalink);
  return true;
}
