// CONTRACT shared by kit/linear.js, kit/slack.js, kit/email.js and the handover workers.
//
// Each teammate's AI is a persona. Everything it says is labelled as AI (brief ground rule).
// Ledger shape: see Ledger in handover/dispatch.js. state/ledger.json = { obligations[], conflicts[], linear_fixes[], ... }
//
// kit/linear.js  export async function seedPack()              -> [{ packId:"ZAP-101", id, identifier, url }]  (idempotent: finds "[ZAP-101]" title prefix)
//                export async function applyLedger(ledger)      -> [{ key, identifier, url, action:"updated"|"created"|"unchanged" }]  (idempotent: marker "ledger-key: <key>" in description)
//                export async function comment(issueId, body)   -> { url }   (idempotent if body contains a "marker:" line already present on the issue)
// kit/slack.js   export async function postAs(personId, channel, text, { thread_ts } = {}) -> { channel, ts, permalink }
//                export async function ensureChannels(names)    -> { [name]: channelId }   (creates if missing, bot joins)
// kit/email.js   export async function sendEmail({ personId, intendedTo, subject, text, ics }) -> { messageId, gmailUrl }
//                (always delivered to GMAIL_USER, never to intendedTo: every pack address ends in .example)
import { team } from "./sources.js";

const STYLE = {
  sam: { icon: ":briefcase:", label: "Sam", color: "#F2994A" },
  weilin: { icon: ":wrench:", label: "Wei Lin", color: "#2D9CDB" },
  dana: { icon: ":telephone_receiver:", label: "Dana", color: "#27AE60" },
  priya: { icon: ":art:", label: "Priya", color: "#BB6BD9" },
};

export const PERSONAS = Object.fromEntries(
  team().map((p) => [
    p.id,
    {
      ...p,
      ...STYLE[p.id],
      aiName: `${p.name.split(" ")[0] === "Wei" ? "Wei Lin" : p.name.split(" ")[0]}'s AI`,
      signature: `${p.name.split(" ")[0] === "Wei" ? "Wei Lin" : p.name.split(" ")[0]}'s AI (an AI assistant working for ${p.name}, ${p.role}, ${p.city})`,
    },
  ]),
);

export const persona = (id) => {
  if (!PERSONAS[id]) throw new Error(`unknown person "${id}" (expected one of ${Object.keys(PERSONAS).join(", ")})`);
  return PERSONAS[id];
};

export const LINEAR_TEAM_KEY = "ZAP"; // never write to any other team
export const CHANNELS = { handover: "handover", drops: "drops" };
