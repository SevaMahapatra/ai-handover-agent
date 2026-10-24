// Loads the work pack into citable items with stable refs:
// C01.. calls (Granola) · E01.. emails · S01.. Slack · W01.. WhatsApp · K01.. calendar · ZAP-1xx Linear.
// Drops posted later go in work_pack/drops/*.json as arrays of {kind, at, from?, text} and get refs D01...
import fs from "node:fs";

const PACK = "work_pack/work_pack";
const read = (f) => JSON.parse(fs.readFileSync(`${PACK}/${f}`, "utf8"));
const n = (i) => String(i + 1).padStart(2, "0");

export const team = () => read("team.json");

export function loadSources() {
  const items = [];
  for (const c of read("calls/calls.json"))
    items.push({ ref: c.id, kind: "call", at: c.start, from: c.attendees.join(", "), text: `${c.title}\n${c.notes}` });
  for (const e of read("inbox/emails.json"))
    items.push({ ref: e.id, kind: `email-${e.folder}`, at: e.at, from: e.frm, text: `To: ${e.to.join(", ")}${e.cc ? ` Cc: ${e.cc.join(", ")}` : ""}\nSubject: ${e.subject}\n${e.body}` });
  read("slack/messages.json").forEach((m, i) =>
    items.push({ ref: `S${n(i)}`, kind: "slack", at: m.at, from: `@${m.user} in ${m.channel}`, text: m.text }));
  read("whatsapp/messages.json").forEach((m, i) =>
    items.push({ ref: `W${n(i)}`, kind: "whatsapp", at: m.at, from: `${m.chat} -> ${m.to}`, text: m.text }));
  read("calendar/events.json").forEach((ev, i) =>
    items.push({ ref: `K${n(i)}`, kind: "calendar", at: ev.start, from: ev.attendees.join(", "), text: `${ev.title} ${ev.start} to ${ev.end}${ev.where ? ` @ ${ev.where}` : ""}` }));
  for (const t of read("linear/issues.json"))
    items.push({ ref: t.id, kind: "linear", at: t.due ?? null, from: t.assignee ?? "UNASSIGNED", text: `${t.title} [${t.status}]${t.due ? ` due ${t.due}` : ""}${t.note ? ` note: ${t.note}` : ""}` });

  const dropsDir = process.env.DROPS_DIR || "work_pack/drops";
  let d = 0;
  if (fs.existsSync(dropsDir))
    for (const f of fs.readdirSync(dropsDir).filter((f) => f.endsWith(".json")).sort())
      for (const x of JSON.parse(fs.readFileSync(`${dropsDir}/${f}`, "utf8")))
        items.push({ ref: `D${n(d++)}`, kind: `drop-${x.kind ?? "msg"}`, at: x.at, from: x.from ?? f, text: x.text });
  return items;
}

if (import.meta.filename === process.argv[1]) {
  const items = loadSources();
  const by = {};
  for (const i of items) by[i.kind] = (by[i.kind] ?? 0) + 1;
  console.log(`${items.length} sources`, by);
  console.log(items.slice(0, 2), items.at(-1));
}
