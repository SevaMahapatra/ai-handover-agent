// Preflight: every key and service the handover needs, checked in parallel, then a PASS/FAIL table. Run via ./preflight.sh
import "dotenv/config";
import { isPlaceholder } from "../kit/env.js";
import tls from "node:tls";

const TIMEOUT_MS = 45_000;
// Placeholder values (copied from .env.example) count as unset.
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => !isPlaceholder(v)));
const need = (...keys) => { const miss = keys.filter((k) => !env[k]); if (miss.length) throw new Error(`missing or placeholder in .env: ${miss.join(", ")}`); };

async function http(url, opts = {}) {
  const r = await fetch(url, opts);
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 140)}`);
  return { json: body ? JSON.parse(body) : {}, headers: r.headers };
}

// Must match kit/slack-manifest.yaml
const SLACK_SCOPES = ["app_mentions:read", "channels:history", "channels:join", "channels:manage", "channels:read", "chat:write", "chat:write.customize", "im:history", "im:read", "im:write", "reactions:read", "reactions:write", "users:read"];

// Minimal SMTP login (implicit TLS, AUTH PLAIN) so we can verify the Gmail app password without sending anything.
function smtpLogin(user, pass) {
  return new Promise((resolve, reject) => {
    const s = tls.connect(465, "smtp.gmail.com", { servername: "smtp.gmail.com" });
    const steps = [
      [220, () => s.write("EHLO preflight\r\n")],
      [250, () => s.write(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString("base64")}\r\n`)],
      [235, () => { s.write("QUIT\r\n"); resolve(); }],
    ];
    let buf = "";
    s.on("data", (d) => {
      buf += d;
      const lines = buf.split("\r\n");
      buf = lines.pop();
      for (const line of lines) {
        if (line[3] === "-") continue; // multi-line reply continues
        const code = Number(line.slice(0, 3));
        const [want, next] = steps[0] ?? [];
        if (code !== want) return reject(new Error(`SMTP ${line}`)), s.destroy();
        steps.shift();
        next();
      }
    });
    s.on("error", reject);
    s.setTimeout(15_000, () => (reject(new Error("SMTP timeout")), s.destroy()));
  });
}

const checks = {
  "Anthropic API": async () => {
    need("ANTHROPIC_API_KEY");
    const { client } = await import("../kit/claude.js");
    const page = await client.models.list({ limit: 1 });
    return `key ok (${page.data[0]?.id ?? "no models listed"})`;
  },

  "Slack bot": async () => {
    need("SLACK_BOT_TOKEN");
    const { json, headers } = await http("https://slack.com/api/auth.test", { method: "POST", headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
    if (!json.ok) throw new Error(`auth.test: ${json.error}`);
    const have = (headers.get("x-oauth-scopes") ?? "").split(",");
    const missing = SLACK_SCOPES.filter((s) => !have.includes(s));
    if (missing.length) throw new Error(`workspace "${json.team}" ok, but missing scopes: ${missing.join(", ")} (add them, then Reinstall to Workspace)`);
    return `workspace "${json.team}" as @${json.user}, all ${SLACK_SCOPES.length} scopes`;
  },

  "Slack Socket Mode": async () => {
    need("SLACK_APP_TOKEN");
    const { json } = await http("https://slack.com/api/apps.connections.open", { method: "POST", headers: { authorization: `Bearer ${env.SLACK_APP_TOKEN}` } });
    if (!json.ok) throw new Error(`apps.connections.open: ${json.error}${json.error === "invalid_auth" ? " (needs the xapp- token with connections:write)" : ""}`);
    return "socket URL issued (Socket Mode on)";
  },

  Linear: async () => {
    need("LINEAR_API_KEY");
    const { json } = await http("https://api.linear.app/graphql", {
      method: "POST",
      headers: { authorization: env.LINEAR_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { name email } teams { nodes { key name } } }" }),
    });
    if (json.errors) throw new Error(json.errors[0].message);
    return `as ${json.data.viewer.name}; teams: ${json.data.teams.nodes.map((t) => `${t.key} (${t.name})`).join(", ") || "none"}`;
  },

  "Gmail SMTP": async () => {
    need("GMAIL_USER", "GMAIL_APP_PASSWORD");
    await smtpLogin(env.GMAIL_USER, env.GMAIL_APP_PASSWORD.replace(/\s/g, ""));
    return `login ok as ${env.GMAIL_USER.replace(/(.{2}).*@/, "$1***@")}`;
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
      return { name, status: "FAIL", detail: e.message, ms: Date.now() - s };
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
