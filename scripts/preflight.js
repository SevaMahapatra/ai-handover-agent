// Preflight: every key and service checked in parallel, then a PASS/FAIL/SKIP table. Run via ./preflight.sh
// Required checks FAIL when unconfigured; optional ones SKIP until their keys are in .env.
import "dotenv/config";
import fs from "node:fs";
import { exec } from "node:child_process";

const TIMEOUT_MS = 45_000;
const env = process.env;
class Skip extends Error {}
const skip = (msg) => { throw new Skip(msg); };
const need = (...keys) => { const miss = keys.filter((k) => !env[k]); if (miss.length) throw new Error(`missing in .env: ${miss.join(", ")}`); };

const run = (cmd) =>
  new Promise((res, rej) =>
    exec(cmd, { timeout: 15_000 }, (err, out, errOut) => (err ? rej(new Error((errOut || err.message).trim().split("\n")[0])) : res(out.trim()))),
  );
const onPath = (bin) => run(`${process.platform === "win32" ? "where" : "which"} ${bin}`).then(() => true, () => false);

async function http(url, opts = {}) {
  const r = await fetch(url, opts);
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 140)}`);
  return body ? JSON.parse(body) : {};
}

const tg = (method, params = {}) =>
  http(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });

const checks = {
  "Anthropic API": async () => {
    need("ANTHROPIC_API_KEY");
    const { client } = await import("../vision/claude.js");
    const page = await client.models.list({ limit: 1 });
    return `key ok (${page.data[0]?.id ?? "no models listed"})`;
  },

  "VLM JSON": async () => {
    need("ANTHROPIC_API_KEY");
    const { grabOne } = await import("../vision/capture.js");
    const { analyzeFrame } = await import("../vision/analyze.js");
    const rules = JSON.parse(fs.readFileSync("vision/rules/phone.json", "utf8"));
    const v = await analyzeFrame(await grabOne("vision/samples/test.mp4"), rules);
    const ok = typeof v.violation === "boolean" && typeof v.description === "string" && typeof v.confidence === "number";
    if (!ok) throw new Error(`bad shape: ${JSON.stringify(v).slice(0, 140)}`);
    return `valid JSON, violation=${v.violation} conf=${v.confidence}`;
  },

  Webcam: async () => {
    const { grabOne, WEBCAM } = await import("../vision/capture.js");
    const jpg = await grabOne("webcam");
    if (jpg.length < 5000 || jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error(`no frame from "${WEBCAM}" (busy? close live.js / Zoom / Camera app)`);
    fs.mkdirSync("vision/out", { recursive: true });
    fs.writeFileSync("vision/out/preflight_webcam.jpg", jpg);
    return `"${WEBCAM}" ok, ${jpg.length} B -> vision/out/preflight_webcam.jpg`;
  },

  Telegram: async () => {
    need("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID");
    const me = await tg("getMe");
    const ids = env.TELEGRAM_CHAT_ID.split(",").map((s) => s.trim());
    for (const chat_id of ids) await tg("sendMessage", { chat_id, text: `✅ preflight ${new Date().toLocaleTimeString()}` });
    return `@${me.result.username} sent to ${ids.length} chat(s)`;
  },

  "Email (Resend)": async () => {
    if (!env.RESEND_API_KEY) skip("not configured (RESEND_API_KEY)");
    await http("https://api.resend.com/domains", { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
    return "key ok";
  },

  "SMS/call (Twilio)": async () => {
    if (!env.TWILIO_ACCOUNT_SID) skip("not configured (TWILIO_ACCOUNT_SID)");
    need("TWILIO_AUTH_TOKEN");
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const a = await http(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`, { headers: { authorization: `Basic ${auth}` } });
    return `account ${a.status}`;
  },

  "Cal.com": async () => {
    if (!env.CALCOM_API_KEY) skip("not configured (CALCOM_API_KEY)");
    const me = await http("https://api.cal.com/v2/me", { headers: { authorization: `Bearer ${env.CALCOM_API_KEY}` } });
    return `logged in as ${me.data?.username ?? "?"}`;
  },

  Vercel: async () => {
    if (env.VERCEL_TOKEN) {
      const u = await http("https://api.vercel.com/v2/user", { headers: { authorization: `Bearer ${env.VERCEL_TOKEN}` } });
      return `token ok (${u.user?.username})`;
    }
    if (!(await onPath("vercel"))) skip("not configured (no VERCEL_TOKEN, CLI not installed)");
    return `CLI logged in as ${await run("vercel whoami")}`;
  },

  ngrok: async () => {
    if (!(await onPath("ngrok"))) skip("not installed");
    await run("ngrok config check");
    const t = await fetch("http://127.0.0.1:4040/api/tunnels").then((r) => r.json(), () => null);
    return t?.tunnels?.length ? `tunnel up: ${t.tunnels.map((x) => x.public_url).join(" ")}` : "config ok, no tunnel running";
  },
};

const t0 = Date.now();
const results = await Promise.all(
  Object.entries(checks).map(async ([name, fn]) => {
    const s = Date.now();
    try {
      const detail = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS))]);
      return { name, status: "PASS", detail, ms: Date.now() - s };
    } catch (e) {
      return { name, status: e instanceof Skip ? "SKIP" : "FAIL", detail: e.message, ms: Date.now() - s };
    }
  }),
);

const color = { PASS: "\x1b[42;30m", FAIL: "\x1b[41;97m", SKIP: "\x1b[43;30m" };
const w = Math.max(...results.map((r) => r.name.length));
console.log(`\n${"CHECK".padEnd(w)}  STATUS  TIME    DETAIL`);
for (const r of results)
  console.log(`${r.name.padEnd(w)}  ${color[r.status]} ${r.status} \x1b[0m  ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.detail}`);
const fails = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${fails ? `\x1b[31m${fails} FAILED` : "\x1b[32mALL GREEN"}\x1b[0m in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
process.exit(fails ? 1 : 0);
