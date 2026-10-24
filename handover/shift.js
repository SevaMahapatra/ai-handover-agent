// Shifts: everyone works 08:00-20:00 in their own tz (team.json), any day. state/shifts.json = { personId: { onShift, since } }.
// shiftChanges(now) -> { first, state, transitions: [{ personId, to: "on"|"off", date }], save() }  (save after the cycle succeeds)
import fs from "node:fs";
import { team } from "./sources.js";

export const SHIFTS = "state/shifts.json";

export function local(now, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), label: `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${tz}` };
}

export const isOnShift = (now, tz) => local(now, tz).hour >= 8 && local(now, tz).hour < 20;

export function shiftChanges(now) {
  const prev = fs.existsSync(SHIFTS) ? JSON.parse(fs.readFileSync(SHIFTS, "utf8")) : null;
  const state = {}, transitions = [];
  for (const p of team()) {
    const on = isOnShift(now, p.tz), old = prev?.[p.id];
    if (old && old.onShift !== on) transitions.push({ personId: p.id, to: on ? "on" : "off", date: local(now, p.tz).date });
    state[p.id] = old && old.onShift === on ? old : { onShift: on, since: now.toISOString() };
  }
  const save = () => (fs.mkdirSync("state", { recursive: true }), fs.writeFileSync(SHIFTS, JSON.stringify(state, null, 2)));
  return { first: !prev, state, transitions, save };
}
