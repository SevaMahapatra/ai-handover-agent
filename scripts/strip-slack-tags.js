// One-time migration: move dedupe tags ([draft:..], [qitem:..], [pickup:..] ...) out of our bot's existing Slack
// messages into invisible message metadata (chat.update). Run with the supervisor stopped. Safe to rerun.
import "dotenv/config";
import { TAG } from "../kit/slack.js";

const H = { authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` };
const call = async (m, b, json = false) => {
  const j = await (await fetch(`https://slack.com/api/${m}`, { method: "POST", headers: { ...H, "content-type": json ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded" }, body: json ? JSON.stringify(b) : new URLSearchParams(b) })).json();
  if (!j.ok) throw new Error(`slack ${m}: ${j.error}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const me = await call("auth.test", {});
const chans = (await call("conversations.list", { types: "public_channel", limit: "1000" })).channels.filter((c) => ["handover", "drops"].includes(c.name));
for (const c of chans) {
  let moved = 0;
  const top = (await call("conversations.history", { channel: c.id, limit: "1000", include_all_metadata: "true" })).messages;
  for (const m of top) {
    const all = m.reply_count ? (await call("conversations.replies", { channel: c.id, ts: m.ts, limit: "1000", include_all_metadata: "true" })).messages : [m];
    for (const r of all) {
      if (r.bot_id !== me.bot_id || !r.text || !r.text.match(TAG)) continue;
      const tags = [...(r.metadata?.event_payload?.markers?.split(" ") ?? []), ...r.text.match(TAG).map((t) => t.trim())];
      const text = r.text.replace(TAG, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      await call("chat.update", { channel: c.id, ts: r.ts, text, metadata: { event_type: "handover_ai", event_payload: { markers: [...new Set(tags)].join(" ") } } }, true);
      moved++;
      await sleep(1300); // chat.update rate limit
    }
  }
  console.log(`#${c.name}: moved tags out of ${moved} messages`);
}
