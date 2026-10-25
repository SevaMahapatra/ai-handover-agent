// Slack as each teammate's AI. Contract: handover/personas.js. Plain fetch against the Web API, no SDK.
// postAs(personId, channel, text, {thread_ts}) -> {channel, ts, permalink}
// ensureChannels(names) -> {name: id}   (creates if missing, bot joins; ids cached in memory)
// findMessage(channel, marker, {thread_ts}) -> {ts, permalink} | null   (idempotency across restarts)
import { requireEnv, cli } from "./env.js";
import { logKitEvent } from "./events.js";
import { persona, PERSONAS, CHANNELS } from "../handover/personas.js";

async function api(method, body = {}) {
  const { SLACK_BOT_TOKEN } = requireEnv("SLACK_BOT_TOKEN");
  // Read methods ignore JSON bodies, so send those form-encoded.
  const form = /^(conversations\.(list|history|replies)|chat\.getPermalink)$/.test(method);
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SLACK_BOT_TOKEN}`, "content-type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8" },
    body: form ? new URLSearchParams(clean) : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
  if (!j.ok) {
    const extra = j.needed ? ` (needed: ${j.needed}, provided: ${j.provided})` : "";
    throw new Error(`slack ${method}: ${j.error}${extra}`);
  }
  return j;
}

const ids = {}; // name -> id, per process

async function listChannels() {
  let cursor;
  do {
    const j = await api("conversations.list", { types: "public_channel", exclude_archived: true, limit: 1000, cursor });
    for (const c of j.channels) ids[c.name] = c.id;
    cursor = j.response_metadata?.next_cursor;
  } while (cursor);
}

export async function ensureChannels(names) {
  if (names.some((n) => !ids[n])) await listChannels();
  for (const name of names) {
    if (!ids[name]) {
      try {
        ids[name] = (await api("conversations.create", { name })).channel.id;
      } catch (e) {
        if (!e.message.endsWith("name_taken")) throw e;
        await listChannels();
        if (!ids[name]) throw new Error(`slack: #${name} is taken but not visible (archived or private?)`);
      }
    }
    await api("conversations.join", { channel: ids[name] });
  }
  return Object.fromEntries(names.map((n) => [n, ids[n]]));
}

const resolve = async (channel) => (/^[CG][A-Z0-9]{6,}$/.test(channel) ? channel : (await ensureChannels([channel.replace(/^#/, "")]))[channel.replace(/^#/, "")]);
const permalink = async (channel, ts) => (await api("chat.getPermalink", { channel, message_ts: ts })).permalink;

// Dedupe tags like [draft:email:x] or [pickup:weilin:2026-10-25:live] never show in Slack: postAs moves them into
// invisible message metadata, and findMessage/hasMarker read them from there. Only lowercase "word:" tags with no spaces
// count, so "[ZAP-102]" and placeholders like "[PRICE: Sam to decide]" stay in the text.
export const TAG = /[ \t]*\[[a-z][a-z0-9-]*:[^\]\s]*\]/g;
export const hasMarker = (m, marker) => !!(m.text?.includes(marker) || m.metadata?.event_payload?.markers?.includes(marker));

const split = (text) => ({
  tags: (text.match(TAG) ?? []).map((t) => t.trim()),
  clean: text.replace(TAG, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
});
const meta = (tags) => (tags.length ? { metadata: { event_type: "handover_ai", event_payload: { markers: tags.join(" ") } } } : {});

// blocks: optional Block Kit layout (then `text` is the notification fallback, and the blocks must carry the AI label).
export async function postAs(personId, channel, text, { thread_ts, blocks } = {}) {
  const p = persona(personId);
  channel = await resolve(channel);
  const { tags, clean } = split(text);
  const r = await api("chat.postMessage", {
    channel,
    username: p.aiName,
    icon_emoji: p.icon,
    // No signature line: the sender shows as "<Name>'s AI" with Slack's APP badge, which already says it's an AI.
    // (Emails to people outside keep their AI disclosure; see kit/email.js.)
    text: clean,
    unfurl_links: false,
    ...(blocks ? { blocks } : {}),
    ...(thread_ts ? { thread_ts } : {}),
    ...meta(tags),
  });
  const link = await permalink(channel, r.ts);
  logKitEvent("slack.posted", `${p.aiName} in ${channel}: ${text.slice(0, 60)}`, { channel, ts: r.ts, permalink: link });
  return { channel, ts: r.ts, permalink: link };
}

// Edit a message in place (live handover cards). Tags in `text` go to metadata again, so lookups keep finding it.
export async function updateMessage(personId, channel, ts, text, blocks) {
  const p = persona(personId);
  const { tags, clean } = split(text);
  await api("chat.update", { channel, ts, text: clean, ...(blocks ? { blocks } : {}), ...meta(tags) });
}

export async function findMessage(channel, marker, { thread_ts } = {}) {
  channel = await resolve(channel);
  const j = thread_ts
    ? await api("conversations.replies", { channel, ts: thread_ts, limit: 200, include_all_metadata: true })
    : await api("conversations.history", { channel, limit: 200, include_all_metadata: true });
  const m = j.messages.find((m) => hasMarker(m, marker));
  return m ? { ts: m.ts, permalink: await permalink(channel, m.ts) } : null;
}

// Post unless a message containing `marker` already exists. Returns {ts, permalink, existed}.
async function postOnce(personId, channel, text, marker, opts = {}) {
  const found = await findMessage(channel, marker, opts);
  if (found) return { ...found, existed: true };
  return { ...(await postAs(personId, channel, `${text} ${marker}`, opts)), existed: false };
}

// CLI: node kit/slack.js   (idempotent: intros + one thread reply)
if (import.meta.filename === process.argv[1]) {
  cli(async () => {
    const chans = await ensureChannels([CHANNELS.handover, CHANNELS.drops]);
    console.log(`channels: ${Object.entries(chans).map(([n, id]) => `#${n}=${id}`).join(" ")}`);
    const show = (label, r) => console.log(`${r.existed ? "already posted" : "posted"} ${label}: ${r.permalink}`);
    const intros = {};
    for (const [id, p] of Object.entries(PERSONAS)) {
      const text = `${p.aiName} online. I track what's owed for ${p.name} (${p.role}, ${p.city}).`;
      intros[id] = await postOnce(id, chans.handover, text, `[intro:${id}]`);
      show(`intro ${id}`, intros[id]);
    }
    const reply = await postOnce("weilin", chans.handover, "thread test", "[thread-test:sam]", { thread_ts: intros.sam.ts });
    show("thread reply weilin -> sam", reply);
  });
}
