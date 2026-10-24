// sendEmail({ personId, intendedTo, cc, subject, text, ics, marker }) -> { messageId, gmailUrl }
// Gmail SMTP via nodemailer. ALWAYS delivered to GMAIL_USER only: every pack address ends in .example.
import nodemailer from "nodemailer";
import { requireEnv, cli } from "./env.js";
import { makeIcs } from "./ics.js";
import { logKitEvent } from "./events.js";
import { persona } from "../handover/personas.js";

const list = (x) => [].concat(x ?? []).filter(Boolean);

export async function sendEmail({ personId, intendedTo, cc = [], subject, text, ics, marker }) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = requireEnv("GMAIL_USER", "GMAIL_APP_PASSWORD");
  const p = persona(personId);
  const to = list(intendedTo), ccs = list(cc);
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
  });
  const body = [
    `Intended recipients: ${to.join(", ") || "(none)"}; cc: ${ccs.join(", ") || "(none)"} (test mode: delivered to the operator inbox)`,
    "",
    text,
    `\n-- \n${p.signature}`,
    ...(marker ? [`marker: ${marker}`] : []),
  ].join("\n");
  const msg = {
    from: { name: p.aiName, address: GMAIL_USER },
    to: GMAIL_USER, // never intendedTo / cc
    replyTo: p.email,
    subject: `[for: ${to.join(", ")}] ${subject}`,
    text: body,
    ...(marker ? { messageId: `<${marker}@zapdemo-handover>` } : {}),
  };
  if (ics) {
    const content = makeIcs(ics);
    msg.icalEvent = { method: "REQUEST", content };
    msg.attachments = [{ filename: "invite.ics", content, contentType: "text/calendar; method=REQUEST; charset=UTF-8" }];
  }
  const info = await transport.sendMail(msg);
  const messageId = info.messageId;
  const gmailUrl = "https://mail.google.com/mail/u/0/#search/rfc822msgid%3A" + encodeURIComponent(messageId.replace(/^<|>$/g, ""));
  logKitEvent("email.sent", `Email as ${p.aiName} for ${to.join(", ")}: ${subject.slice(0, 60)}`, { messageId, intendedTo: to, cc: ccs });
  return { messageId, gmailUrl };
}

// CLI: node kit/email.js  -> one test invite as Dana's AI, delivered to GMAIL_USER
if (import.meta.filename === process.argv[1]) {
  cli(async () => {
    const r = await sendEmail({
      personId: "dana",
      intendedTo: ["maria.gomez@northwind-cold.example"],
      cc: ["sam@zapdemo.example"],
      subject: "PROPOSED: next Northwind call with Tom Reyes (test)",
      text: "Hi Maria,\n\nI'm Dana's AI (an AI assistant). Proposing a 30-minute call with Tom Reyes on Tue 27 Oct, 10:00-10:30 Central, since Tom signs off on anything mounted on the building (sources: C01, E03).\n\nThe invite is attached.",
      ics: {
        uid: "test-northwind-tom@zapdemo-handover",
        title: "PROPOSED: Northwind next call with Tom Reyes",
        start: "2026-10-27T10:00:00-05:00",
        end: "2026-10-27T10:30:00-05:00",
        organizer: "dana@zapdemo.example",
        attendees: ["maria.gomez@northwind-cold.example", "sam@zapdemo.example"],
        description: "Proposed by Dana's AI (an AI assistant). Sources: C01, E03. Tom signs off on anything mounted on the building.",
        location: "Video call",
      },
      marker: "test-email-1",
    });
    console.log(`messageId: ${r.messageId}`);
    console.log(`gmailUrl: ${r.gmailUrl}`);
  });
}
