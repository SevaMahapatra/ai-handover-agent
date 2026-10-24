// sendWhatsApp(text, to?) -> {sid, status}. Twilio WhatsApp sandbox via plain fetch (no SDK). `to` defaults to MY_PHONE.
import { requireEnv, cli } from "./env.js";
import { logKitEvent } from "./events.js";

export async function sendWhatsApp(text, to) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, MY_PHONE } = requireEnv("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "MY_PHONE");
  to = to ?? MY_PHONE;
  const from = process.env.TWILIO_WHATSAPP_FROM || "+14155238886";
  const wa = (n) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: wa(from), To: wa(to), Body: text }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = [63007, 63015].includes(j.code) ? ` (recipient not in sandbox: send 'join <code>' to +1 415 523 8886 on WhatsApp first)` : "";
    throw new Error(`twilio ${res.status}: code ${j.code ?? "?"} ${j.message ?? res.statusText}${hint}`);
  }
  logKitEvent("whatsapp.sent", `WhatsApp to ${to}: ${text.slice(0, 60)}`, { to, sid: j.sid });
  return { sid: j.sid, status: j.status };
}

// CLI: node kit/whatsapp.js "<text>" [to]
if (import.meta.filename === process.argv[1]) {
  cli(async () => {
    const r = await sendWhatsApp(process.argv[2] ?? "Hello from hackathon-kit", process.argv[3]);
    console.log(`sent ${r.sid} (${r.status})`);
  });
}
