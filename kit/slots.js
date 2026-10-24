// Free meeting slots derived from work_pack calendar + team time zones. Pure and deterministic: no network, no LLM.
// freeSlots({ people, external, durationMin, from, to, count, hours, prefer, days }) -> [{ start, end, label }] (+ .reason if [])
// - people: team ids (tz from team.json); external: [{ name, tz }]. Busy = every event with one of `people`, +-15 min buffer.
//   Recurring events ("weekdays" / "Every Friday" in `where`) repeat at the same wall-clock time in attendees[0]'s tz.
// - A slot starts on a :00/:30 boundary, Mon-Fri (or `days`, weekday numbers 0=Sun, in people[0]'s tz), with EVERY attendee
//   inside their local `hours` for the whole slot. Hours are never widened here: callers pass wider hours explicitly.
// - from/to: "YYYY-MM-DD" (to inclusive), read in people[0]'s tz. Default: next working day .. +10 days.
// - prefer "morning": slots before 12:00 in the first external attendee's tz come first.
// - Up to `count` slots, on different days when possible. start/end ISO with offset in people[0]'s tz; label in each tz.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PACK = new URL("../work_pack/work_pack/", import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, PACK), "utf8"));
const MIN = 60000, DAY = 24 * 60 * MIN, BUFFER = 15 * MIN;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

const offMin = (tz, t) => {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(t).find((p) => p.type === "timeZoneName").value;
  const m = s.match(/([+-])(\d\d):(\d\d)/);
  return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
};
const local = (tz, t) => new Date(t + offMin(tz, t) * MIN); // read with getUTC*()
const zoned = (ymd, hm, tz) => { const g = Date.parse(`${ymd}T${hm}:00Z`); return g - offMin(tz, g - offMin(tz, g) * MIN) * MIN; };
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hm = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const ABBR = { "Asia/Singapore": () => "SGT", "America/Chicago": (o) => (o === -300 ? "CDT" : "CST") };
const abbr = (tz, t) => ABBR[tz]?.(offMin(tz, t)) ?? new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(t).find((p) => p.type === "timeZoneName").value;
export const iso = (t, tz) => { const o = offMin(tz, t), d = local(tz, t); return `${ymd(d)}T${hm(d)}:00${o < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; };
export const label = (t, tz) => { const d = local(tz, t); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${hm(d)} ${abbr(tz, t)}`; };

function busyFor(people, until) {
  const tzOf = Object.fromEntries(read("team.json").map((p) => [p.id, p.tz]));
  const out = [];
  for (const ev of read("calendar/events.json")) {
    if (!ev.attendees.some((a) => people.includes(a))) continue;
    const s = Date.parse(ev.start), len = Date.parse(ev.end) - s, tz = tzOf[ev.attendees[0]] ?? "UTC";
    const weekdays = /weekdays/i.test(ev.where), weekly = /every (sun|mon|tue|wed|thu|fri|sat)/i.test(ev.where);
    if (!weekdays && !weekly) { out.push([s - BUFFER, s + len + BUFFER, ev.title]); continue; }
    const first = local(tz, s), wall = hm(first);
    for (let day = Date.parse(`${ymd(first)}T12:00:00Z`); day < until + DAY; day += DAY) {
      const dow = new Date(day).getUTCDay();
      if (weekdays ? dow === 0 || dow === 6 : dow !== first.getUTCDay()) continue;
      const st = zoned(ymd(new Date(day)), wall, tz);
      out.push([st - BUFFER, st + len + BUFFER, ev.title]);
    }
  }
  return out;
}

function nextWorkingDay(tz, now = Date.now()) {
  let d = local(tz, now + DAY);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + DAY);
  return ymd(d);
}

export function freeSlots({ people, external = [], durationMin, from, to, count = 3, hours = [9, 18], prefer, days = [1, 2, 3, 4, 5] }) {
  const tzOf = Object.fromEntries(read("team.json").map((p) => [p.id, p.tz]));
  for (const id of people) if (!tzOf[id]) throw new Error(`slots: unknown person "${id}"`);
  const attendees = [...people.map((id) => ({ name: id, tz: tzOf[id] })), ...external];
  const tz0 = attendees[0].tz, tzs = [...new Set(attendees.map((a) => a.tz))];
  from ??= nextWorkingDay(tz0);
  to ??= ymd(new Date(Date.parse(`${from}T12:00:00Z`) + 10 * DAY));
  const t0 = zoned(from, "00:00", tz0), t1 = zoned(to, "00:00", tz0) + DAY, dur = durationMin * MIN;
  const busy = busyFor(people, t1);
  const fits = (t) => attendees.every(({ tz }) => {
    const d = local(tz, t), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && m >= hours[0] * 60 && m + durationMin <= hours[1] * 60;
  });
  let all = [];
  for (let t = Math.ceil(t0 / (30 * MIN)) * 30 * MIN; t + dur <= t1; t += 30 * MIN) {
    if (!days.includes(local(tz0, t).getUTCDay()) || !fits(t)) continue;
    if (busy.some(([bs, be]) => t < be && t + dur > bs)) continue;
    all.push(t);
  }
  const why = `${attendees.map((a) => `${a.name} (${a.tz})`).join(", ")}, ${pad(hours[0])}:00-${pad(hours[1])}:00 local, ${from}..${to}`;
  if (!all.length) return Object.assign([], { reason: `no common free ${durationMin}-min slot for ${why}` });
  if (prefer === "morning") {
    const ptz = (external[0] ?? attendees[0]).tz;
    all = [...all.filter((t) => local(ptz, t).getUTCHours() < 12), ...all.filter((t) => local(ptz, t).getUTCHours() >= 12)];
  }
  const picked = [], seen = new Set();
  for (const t of all) if (picked.length < count && !seen.has(ymd(local(tz0, t)))) { picked.push(t); seen.add(ymd(local(tz0, t))); }
  for (const t of all) if (picked.length < count && !picked.includes(t)) picked.push(t);
  return picked.sort((a, b) => a - b).map((t) => ({
    start: iso(t, tz0), end: iso(t + dur, tz0),
    label: `${tzs.map((tz) => label(t, tz)).join(" / ")} (${durationMin} min)`,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const show = (title, opts) => {
    const r = freeSlots(opts);
    console.log(`\n${title}`);
    if (!r.length) console.log(`  [] reason: ${r.reason}`);
    for (const s of r) console.log(`  ${s.label}   (${s.start} .. ${s.end})`);
  };
  show("1) Crestline call: Wei Lin + Farah (Singapore), 45 min, from Mon 26 Oct (Harbor install + Crestline 3 Nov are busy)",
    { people: ["weilin"], external: [{ name: "Farah", tz: "Asia/Singapore" }], durationMin: 45, from: "2026-10-26" });
  const tue = freeSlots({ people: ["weilin"], external: [{ name: "Farah", tz: "Asia/Singapore" }], durationMin: 45, from: "2026-11-03", to: "2026-11-03", count: 99 });
  console.log(`1b) same, Tue 3 Nov only, every free start: ${tue.map((s) => s.start.slice(11, 16)).join(" ")} (09:00 = 19:00 CST stand-up; 13:30-16:30 = Harbor install 14:00-16:30 + 15-min buffers)`);
  show("2) Ridgeline site visit: Dana + Omar (Chicago), 120 min, mornings, Tue 27 - Wed 28 Oct",
    { people: ["dana"], external: [{ name: "Omar", tz: "America/Chicago" }], durationMin: 120, from: "2026-10-27", to: "2026-10-28", prefer: "morning" });
  show("3a) Cedar engineer call: Wei Lin + Rachel (Chicago), 20 min, default hours 09-18 (expect none)",
    { people: ["weilin"], external: [{ name: "Rachel", tz: "America/Chicago" }], durationMin: 20, from: "2026-10-26" });
  show("3b) Cedar engineer call, hours WIDENED EXPLICITLY to 08-20 local for both (stand-up 19:00 CT is busy)",
    { people: ["weilin"], external: [{ name: "Rachel", tz: "America/Chicago" }], durationMin: 20, from: "2026-10-26", hours: [8, 20] });
}
