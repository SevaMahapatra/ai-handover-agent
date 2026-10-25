// Handover cards: ONE Slack message per person per shift (Block Kit), edited in place every cycle as work completes.
// Everything else that person's AI posts (drafts, asks, work notes, the off-shift summary) goes in that card's thread,
// so #handover reads as a clean log of handovers. Index: state/cards.json { "<pid>|<date>|<mode>": { channel, ts, hash } }.
import fs from "node:fs";
import crypto from "node:crypto";
import { postAs, updateMessage, findMessage, ensureChannels } from "../kit/slack.js";
import { PERSONAS, CHANNELS } from "./personas.js";
import { local } from "./shift.js";
import { listDrafts } from "./drafts.js";

const FILE = "state/cards.json";
const load = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {});
const save = (x) => (fs.mkdirSync("state", { recursive: true }), fs.writeFileSync(FILE, JSON.stringify(x, null, 2)));
const first = (pid) => (PERSONAS[pid].name.startsWith("Wei") ? "Wei Lin" : PERSONAS[pid].name.split(" ")[0]);
const CITY = { Austin: "🌎", Singapore: "🌏" };

// The cycle sets this once, so say() (work.js) can find "the current card" for a person without new parameters.
let cycle = { now: new Date(), mode: "live" };
export const setCycle = (c) => (cycle = c);
const keyOf = (pid) => `${pid}|${local(cycle.now, PERSONAS[pid].tz).date}|${cycle.mode}`;
export const currentCard = (pid) => (PERSONAS[pid]?.label ? load()[keyOf(pid)] ?? null : null);

const li = (o, issueOf, extra = "") => `• <${issueOf[o.key].url}|${issueOf[o.key].identifier}> ${o.title}${extra}`;
const list = (items, max = 5) => (items.length ? items.slice(0, max).join("\n") + (items.length > max ? `\n_+${items.length - max} more on the board_` : "") : "_none_");

// What the card says, from the ledger + live Linear state (info[key].state, comments) + drafts.
function render(pid, { ledger, issueOf, info, onShift, simulated }) {
  const p = PERSONAS[pid], loc = local(cycle.now, p.tz);
  const mine = ledger.obligations.filter((o) => o.owner === pid && issueOf[o.key]);
  const st = (o) => info[o.key]?.state?.type;
  const closed = mine.filter((o) => o.status === "done" || ["completed", "canceled"].includes(st(o)));
  const open = mine.filter((o) => !closed.includes(o)).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const aiDid = open.filter((o) => (info[o.key]?.comments ?? []).some((c) => /marker: (work|scn):/.test(c.body) && !/held back/i.test(c.body)));
  const needs = open.filter((o) => o.needs_human);
  const waiting = listDrafts("pending").filter((d) => d.personId === pid);
  const on = onShift(pid);
  const status = on ? "🟢 on shift" : "🌙 off shift: handed over";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = (d) => (d ? `due ${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : null);
  // One line per task with badges, instead of the same task repeated across sections.
  const line = (o) => li(o, issueOf, [dd(o.due), aiDid.includes(o) && "🤖 AI did its part", o.needs_human && `⚠️ ${first(pid)} decides`].filter(Boolean).map((x) => ` · ${x}`).join(""));
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `${CITY[p.city] ?? "🕒"} ${first(pid)}'s shift · ${p.role}, ${p.city}`.slice(0, 150) } },
    { type: "context", elements: [{ type: "mrkdwn", text: `${status} · ${loc.label.replace(/ [A-Za-z_]+\/[A-Za-z_]+$/, "")} local${simulated ? " · _simulated clock_" : ""} · run by *${p.aiName}*` }] },
    { type: "section", text: { type: "mrkdwn", text: `*▶️ Carried over from the last handover (${open.length} open)*\n${list(open.map(line), 8)}` } },
    ...(closed.length ? [{ type: "section", text: { type: "mrkdwn", text: `*🔒 Closed this shift (${closed.length})*\n${list(closed.map((o) => li(o, issueOf)))}` } }] : []),
    { type: "divider" },
    { type: "context", elements: [{ type: "mrkdwn", text: `*${closed.length}/${mine.length} closed* · 🤖 ${aiDid.length} done by AI · ⚠️ ${needs.length} need ${first(pid)} · ✉️ ${waiting.length} draft${waiting.length === 1 ? "" : "s"} waiting for ✅ · updated ${local(new Date(), p.tz).label.split(" ")[2]} · details and drafts in the thread 🧵` }] },
  ];
  const text = `${first(pid)}'s shift: ${closed.length}/${mine.length} closed, ${needs.length} need ${first(pid)}, ${aiDid.length} done by AI`;
  return { text, blocks };
}

// Make sure today's card exists for these people (posts it once; restart-safe via the index and Slack metadata).
export async function ensureCards(pids, ctx) {
  const idx = load(), out = [];
  const channel = (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover];
  for (const pid of pids) {
    const k = keyOf(pid), marker = `[card:${k.replace(/\|/g, ":")}]`;
    if (idx[k]) continue;
    const found = await findMessage(channel, marker);
    if (found) { idx[k] = { channel, ts: found.ts, hash: "", marker }; continue; }
    const r = render(pid, ctx);
    const m = await postAs(pid, channel, `${r.text}\n${marker}`, { blocks: r.blocks });
    idx[k] = { channel, ts: m.ts, hash: hash(r), marker };
    out.push({ type: "slack", what: `handover card ${pid}`, link: m.permalink });
  }
  save(idx);
  return out;
}

const hash = (r) => crypto.createHash("sha1").update(JSON.stringify(r.blocks.map((b) => (b.type === "context" ? null : b)))).digest("hex");

// Live update: re-render every card of the current day and edit it in place when something changed.
export async function refreshCards(ctx) {
  const idx = load(), out = [];
  for (const pid of Object.keys(PERSONAS).filter((x) => PERSONAS[x].label)) {
    const c = idx[keyOf(pid)];
    if (!c) continue;
    const r = render(pid, ctx), h = hash(r);
    if (h === c.hash) continue;
    await updateMessage(pid, c.channel, c.ts, `${r.text}\n${c.marker ?? ""}`, r.blocks);
    c.hash = h;
    out.push({ type: "slack", what: `card ${pid} updated: ${r.text}`, link: "" });
  }
  save(idx);
  return out;
}
