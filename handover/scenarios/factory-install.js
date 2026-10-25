// Scenario 1 "Factory install" (Harbor Point Yard): Wei Lin's AI chases the network details, checks them against the device
// list IN CODE, flags the blocked camera 3 view with the site's fix, and proposes an install window that fits the site lead.
// Nothing outgoing is sent: Raj's date proposal and Ken's reply become drafts for a human ✅. No Claude calls (all templated
// from source facts). The human part: Wei Lin confirms the date and installs.
import { comment } from "../../kit/linear.js";
import { ensureChannels } from "../../kit/slack.js";
import { say, link, honesty, citedText } from "../work.js";
import { addDraft, listDrafts, setSlack } from "../drafts.js";
import { PERSONAS, CHANNELS } from "../personas.js";
import { scenarioCli } from "./index.js";

export const id = "factory-install";
export const scenario = 1;
const OWNER = "weilin", M = (w) => `scn:${id}:${w}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function run(ctx) {
  const { ledger, issueOf, info, byRef, dry, mode } = ctx, p = PERSONAS[OWNER], out = [];
  if (!dry && !ctx.onShift(OWNER)) return [];
  const find = (refs) => ledger.obligations.find((o) => o.owner === OWNER && o.status !== "done" && refs.every((r) => o.sources.includes(r)));
  const net = find(["E04"]), cam3 = find(["W01"]), date = find(["W02", "K01"]);
  const src = (r) => byRef[r]?.text ?? "";
  // Every HH:MM and date in a body must be in the cited sources (honesty() covers dates/$/addresses; times checked here).
  const check = (where, text, refs, to = []) => {
    const cited = `${citedText(refs, byRef)} ${refs.map((r) => byRef[r]?.at ?? "").join(" ")}`;
    return [...honesty(where, text, to, cited), ...(text.match(/\b\d{1,2}:\d{2}\b/g) ?? []).filter((t) => !cited.includes(t)).map((t) => `${where}: time ${t} not in cited sources`)];
  };
  const lin = async (o, what, body, refs) => {
    const issue = issueOf[o?.key], i = info[o?.key];
    if (!issue || !i) return out.push({ type: "linear", what: `${what}: no Linear issue for ${o?.key ?? "(obligation not found)"}`, link: "", held: true });
    const marker = `marker: ${M(what)}`;
    if (i.comments.some((c) => c.body.includes(marker))) return; // already done
    const flags = check(what, body, refs);
    const text = flags.length ? `**${p.aiName} held this back** (honesty check failed):\n${flags.map((f) => `- ${f}`).join("\n")}\nA human should do this one.` : `**${p.aiName}:** ${body}\n\nSources: ${refs.join(", ")}`;
    out.push({ type: "linear", what: `${issue.identifier} ${what}${dry ? `: ${text}` : ""}`, link: dry ? "(dry)" : (await comment(i.id, `${text}\n\n${marker}`)).url, ...(flags.length && { held: true }) });
  };
  const draft = async (o, what, { intendedTo, subject, text, refs, slackIntro }) => {
    const did = M(what), flags = check(what, `${subject}\n${text}`, refs, intendedTo);
    if (flags.length) return out.push({ type: "draft", what: `${did} held back: ${flags.join("; ")}`, link: "", held: true });
    const existing = listDrafts().find((d) => d.id === did);
    if (existing?.slack) return;
    if (dry) return out.push({ type: "draft", what: `${did} for ${intendedTo.join(", ")}: ${text}`, link: "(dry)" });
    const d = addDraft({ id: did, personId: OWNER, obligationKey: o.key, payload: { personId: OWNER, intendedTo, cc: [], subject, text, marker: did } });
    const quote = text.split("\n").map((l) => `> ${l}`).join("\n"), iss = issueOf[o.key];
    const s = await say(OWNER, `${slackIntro}\n✉️ Draft to ${intendedTo.join(", ")}: *${subject}*\n${quote}\nSources: ${refs.join(", ")}${iss ? ` · ${link(iss)}` : ""}\n✅ send · ❌ discard\n[${M(what)}:${mode}]`, `[draft:${did}]`, ctx.note(OWNER));
    setSlack(d.id, { channel: s.channel ?? (await ensureChannels([CHANNELS.handover]))[CHANNELS.handover], ts: s.ts, permalink: s.permalink });
    if (!s.existed) out.push({ type: "draft", what: `${did} posted for approval`, link: s.permalink });
  };

  // 1. IP CHECK, in code: Ken's range (E04) vs the camera count on the call (C02).
  if (net) {
    const e = src("E04"), range = e.match(/\b(\d+\.\d+\.\d+)\.0\/(\d+)/), gw = e.match(/gateway (\d+\.\d+\.\d+\.\d+)/i)?.[1];
    const ips = e.match(/\.(\d+) to \.(\d+)/), cams = +(src("C02").match(/(\d+) cameras/)?.[1] ?? NaN);
    const n = ips ? +ips[2] - +ips[1] + 1 : NaN, ok = n === cams;
    const gwOk = gw && range && gw.startsWith(`${range[1]}.`) && !(ips && +gw.split(".")[3] >= +ips[1] && +gw.split(".")[3] <= +ips[2]);
    const vlan = /VLAN/i.test(e) ? "; open: Ken asked about a VLAN (needs Wei Lin)" : "";
    const body = !ips || !range || isNaN(cams) ? `IP plan check: could not read ${!ips ? "the camera address range" : !range ? "the subnet" : "the camera count"} from the sources, so nothing was checked. Wei Lin to review E04 against C02.`
      : `IP plan checked against the device list: ${cams} cameras ${ok ? "↔" : "≠"} ${n} addresses (.${ips[1]}–.${ips[2]}) ${ok ? "✓" : `✗ MISMATCH: ${cams} cameras but ${n} addresses, Ken must send ${cams > n ? "more" : "fewer"}`}; gateway ${gw ?? "(not given)"} ${gwOk ? `is in ${range[1]}.0/${range[2]} and outside the camera range ✓` : "needs checking ✗"}${vlan}.`
        + (ok ? `\nAssignment: ${Array.from({ length: n }, (_, k) => `cam ${k + 1} = ${range[1]}.${+ips[1] + k}`).join(", ")}.` : "");
    await lin(net, "ip-check", body, ["C02", "E04"]);
    // Ken's reply, unless an equivalent email draft already exists for this obligation.
    const already = listDrafts().some((d) => d.obligationKey === net.key && d.id.startsWith("email:")) || (info[net.key]?.comments ?? []).some((c) => c.body.includes("drafted an email"));
    const ken = byRef.E04?.from; // Ken's address as written in the source (E04 sender)
    if (!already && ips && ok) await draft(net, "ken-reply", {
      intendedTo: [ken], subject: "Re: IP range for Tuesday 3 Nov install", refs: ["C02", "E04"],
      slackIntro: `${p.aiName}: Ken's IP plan checks out (${cams} cameras, ${n} addresses). Reply to Ken ready; the VLAN answer is left for Wei Lin.`,
      text: `Hi Ken, this is ${p.aiName}, an AI assistant writing on behalf of ${p.name}.\nThanks for the network details. Confirmed: range ${range[1]}.0/${range[2]}, gateway ${gw}, and .${ips[1]} to .${ips[2]} for the ${cams} cameras (one address per camera).\nOn your VLAN question: [VLAN: Wei Lin to answer].`,
    });
  } else out.push({ type: "linear", what: "ip-check: no open obligation citing E04 in the ledger", link: "", held: true });

  // 2. CAMERA 3: the site's proposed fix, source facts only.
  if (cam3 && /2m left onto the column/.test(src("W01")))
    await lin(cam3, "cam3-fix", "Blocked view (W01): proposed fix from the site: move cam 3 2m left onto the column. Wei Lin to confirm coverage of bay C.", ["C02", "W01"]);

  // 3. DATE that fits the site lead: Raj's start (W02), the forklift cut-off (W02), the booked window (K01).
  if (date) {
    const w = src("W02"), k = src("K01").match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}).*?T(\d{2}:\d{2})/);
    const start = w.match(/start (\d{1,2}:\d{2})/)?.[1], fork = w.match(/[Ff]orklifts move at (\d{1,2}:\d{2})/)?.[1];
    if (!start || !fork || !k) out.push({ type: "slack", what: "date: Raj's start, the forklift time or the calendar window is missing from the sources; needs Wei Lin", link: "", held: true });
    else {
      const end = fork < k[3] ? fork : k[3], dd = new Date(`${k[1]}T12:00:00Z`);
      const day = `${DOW[dd.getUTCDay()]} ${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}`;
      const proposed = `PROPOSED: ${day} ${start}–${end} SGT (Raj's start time, ends before forklifts at ${fork})`;
      await draft(date, "raj-date", {
        intendedTo: ["[CONTACT: Raj's WhatsApp]"], subject: `Harbor Point install ${day}: ${start} start`, refs: ["C02", "W02", "K01"],
        slackIntro: `${p.aiName}: ${proposed}. The calendar has ${k[2]}–${k[3]}; it moves only after Wei Lin agrees.\nWei Lin confirms the date.`,
        text: `Hi Raj, this is ${p.aiName}, an AI assistant for ${p.name}.\n${proposed}. ${p.name} confirms the date.`,
      });
    }
  }
  return out;
}

if (import.meta.filename === process.argv[1]) await scenarioCli(run);
