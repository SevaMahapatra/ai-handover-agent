// makeIcs({uid, title, start, end, attendees, organizer, description, location}) -> .ics text (RFC 5545 REQUEST).
// start/end: ISO strings with offset. The same uid + a higher sequence updates the same event in the recipient's calendar.
const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s = "") => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545: lines over 75 octets are folded with CRLF + space
const fold = (line) => line.match(/.{1,74}/g).join("\r\n ");

export function makeIcs({ uid, title, start, end, attendees = [], organizer, description = "", location = "", sequence = 0 }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//zapdemo handover AI//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    ...(organizer ? [`ORGANIZER:mailto:${organizer}`] : []),
    ...attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// CLI: node kit/ics.js  -> writes kit/out/test.ics and prints it
if (import.meta.filename === process.argv[1]) {
  const fs = await import("node:fs");
  const ics = makeIcs({
    uid: "test-northwind-tom@zapdemo.example",
    title: "PROPOSED: Northwind next call with Tom Reyes",
    start: "2026-10-27T10:00:00-05:00",
    end: "2026-10-27T10:30:00-05:00",
    organizer: "dana@zapdemo.example",
    attendees: ["maria.gomez@northwind-cold.example", "sam@zapdemo.example"],
    description: "Proposed by Dana's AI (an AI assistant). Source: C01, E03. Tom signs off on anything mounted on the building.",
    location: "Video call",
  });
  fs.mkdirSync("kit/out", { recursive: true });
  fs.writeFileSync("kit/out/test.ics", ics);
  console.log(ics);
}
