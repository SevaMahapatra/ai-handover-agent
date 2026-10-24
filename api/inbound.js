// POST /api/inbound: inbound SMS / call webhook.
// Twilio SMS (form: From, Body)  -> TwiML reply text back to the sender's phone.
// Twilio voice (form: CallSid)   -> TwiML <Say>.
// Vapi / Retell / anything JSON  -> logged, {ok:true}.
import { logKitEvent } from "../kit/events.js";

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
  const from = body.From ?? body.call?.customer?.number ?? null;
  console.log(`[inbound] ${kind} from=${from ?? "-"} ${body.Body ?? ""}`);
  logKitEvent(`${kind === "sms" || kind === "call" ? kind : "voiceagent"}.received`, `${kind} from ${from ?? "unknown"}${body.Body ? `: ${body.Body}` : ""}`, body);

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
