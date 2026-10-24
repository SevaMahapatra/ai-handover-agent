// POST /api/inbound: inbound SMS / call webhook.
// Twilio SMS (form: From, Body)  -> TwiML reply text back to the sender's phone.
// Twilio voice (form: CallSid)   -> TwiML <Say>.
// Vapi / Retell / anything JSON  -> logged, {ok:true}.
import fs from "node:fs";

const LOG = "kit/out/inbound.json";

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? parse(req.body, req) : req.body; // Vercel pre-parses
  let raw = "";
  for await (const c of req) raw += c;
  return parse(raw, req);
}
function parse(raw, req) {
  if ((req.headers["content-type"] ?? "").includes("json")) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

export default async function handler(req, res) {
  const body = await readBody(req);
  const kind = body.Body !== undefined ? "sms" : body.CallSid ? "call" : body.message?.type ?? body.event ?? "json";
  const event = { ts: new Date().toISOString(), kind, from: body.From ?? body.call?.customer?.number ?? null, text: body.Body ?? null, body };
  console.log(`[inbound] ${event.ts} ${kind} from=${event.from ?? "-"} ${event.text ?? ""}`);
  try {
    fs.mkdirSync("kit/out", { recursive: true });
    const all = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];
    all.push(event);
    fs.writeFileSync(LOG, JSON.stringify(all, null, 2));
  } catch {} // read-only FS on Vercel; console log is enough there

  if (kind === "sms") {
    res.setHeader("content-type", "text/xml");
    return res.end(`<Response><Message>Got it: "${esc(body.Body)}". Logged at ${new Date().toLocaleTimeString()}.</Message></Response>`);
  }
  if (kind === "call") {
    res.setHeader("content-type", "text/xml");
    return res.end(`<Response><Say>Thanks for calling. Your call was logged.</Say></Response>`);
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}
