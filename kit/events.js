// CONTRACT: kit event log, shared by every kit action and the /status page.
// Event shape: { ts: ISO string, type: "<service>.<verb>" (e.g. "linear.commented", "slack.posted", "email.sent"), summary: one line, data: object }
import fs from "node:fs";

export const EVENTS = "kit/out/events.json";

export function readKitEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS, "utf8"));
  } catch {
    return [];
  }
}

export function logKitEvent(type, summary, data = {}) {
  const e = { ts: new Date().toISOString(), type, summary, data };
  try {
    fs.mkdirSync("kit/out", { recursive: true });
    const all = readKitEvents();
    all.push(e);
    fs.writeFileSync(EVENTS, JSON.stringify(all, null, 2));
  } catch {} // read-only FS (Vercel): event is still returned
  return e;
}

// Newest first.
export const recentKitEvents = (n = 10) => readKitEvents().slice(-n).reverse();
