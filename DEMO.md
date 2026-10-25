# Demo runbook: The 24/7 Handover
Schedule: 3:00 doors · **4:30 / 6:00 / 7:30** check-ins (they restart the AI fresh: carries on = bell, stuck or asks = drink) · **8:30 hands off** (3 min, live, nobody touches the keyboard) · winner at 9.

Key facts:
- **Start command:** `node scripts/supervise.js` (resumes from state/ + Linear + Slack; reruns create nothing twice)
- **Trigger:** paste the hosts' drop into Slack `#drops` (a phone works, so no keyboard). The Lead AI replies in the thread with what changed.
- **Shift change:** real clock, 08:00–20:00 local per person. 7:00pm Austin = Wei Lin + Priya ON (pick up); 8:00pm Austin = Sam + Dana OFF (handover notes). Rehearse with `node handover/run.js --now <ISO>` (labelled simulated).
- **Proof links:** Linear https://linear.app/sevamahapatra/team/ZAP · Slack #handover https://sevas-team.slack.com/archives/C0CBQQYD3PD · #drops https://sevas-team.slack.com/archives/C0CBQQXRM99 · Gmail (invites from "<Name>'s AI")

## Before every check-in (T-10 min)
1. `./preflight.sh`: everything you'll use must be PASS.
2. Rehearse the restart once: kill all agent processes, run `node scripts/supervise.js`, and confirm it resumes without asking.
3. Have these open:
   - **Terminal**: `node scripts/supervise.js` typed in, big font. One terminal per person's AI if they run separately.
   - **Browser tabs**: the Linear board (filtered to this loop), the Slack channel, the inbox, the calendar week view (/status is not used tonight).

## Check-in script (60s)
> "The card is the 24/7 Handover. New since last round: **[Y]**. You restart it."

They restart it. It carries on: point at the **[NEW LINEAR ISSUE / SLACK MESSAGE]** it just produced.
> "It knew **[what's owed, to whom, by when]** from **[the ledger / Linear]**, not from me."

If it stalls, say so. Honesty is judged.

## 8:30 prep (8:10–8:25)
1. `./preflight.sh`: all PASS. `node scripts/linear-audit.js`: "0 open issue(s) missing something".
2. The supervisor is running (`tail -3 state/listen.log` shows a `cycle:` line from the last 5 minutes). Then keyboard down.
3. **Workflow monitor:** run `node server.js` in a second terminal, then open **http://localhost:3000/api/flow** full-screen (F11) as tab 0. **Live** mode lights each step as it fires; **Step** mode = click Next ▶ (or →) to walk the judges through, with "Open proof ↗" per step.
   **Laptop tabs, in this order** (you click with the mouse, no typing):
   1. `work_pack/work_pack/calls/C01.md`, the Granola stand-in (Northwind call)
   2. Linear ZAP board, **grouped by label** (Sam / Wei Lin / Dana / Priya)
   3. Linear: the Northwind price issue (`[ZAP-102] Northwind price`)
   4. Slack `#handover`: the **handover cards** (one per person per shift; Sam's and Dana's turn 🌙 at 8pm, Wei Lin's and Priya's are 🟢)
   5. Slack `#handover`: **"Sam's decisions today"** thread
   6. Gmail inbox
4. **Phone:** Slack open on `#drops` and `#handover`, with the drop text copied to the clipboard (the hosts' 8:30 drop; fallback below).
5. Pick ONE draft with no `[PLACEHOLDER]` for the live ✅, e.g. Dana's AI's invite to Rachel (Cedar engineer call, computed slots). Check it says "React ✅ to send".

## 8:30 final demo (3 min, nobody touches the keyboard)
**0:00–0:20 · The problem.** "6pm Austin: a warehouse lead wants a layout and a price by Thursday. Austin logs off, Singapore wakes up. Tonight everyone on this team has their own AI. Nobody here is typing; it's been running on its own since 6."

**0:20–0:50 · A call ends → work gets made (scenario 3).** Tab 1, then tab 2.
> "Granola notes from the Northwind call. The dispatcher read the whole week, 70 sources, and made each obligation a Linear task with the right owner: layout → Wei Lin, price → Sam, the call with Tom → Dana, the VP one-pager → Priya."

Tab 3: point at **Due**, **Sources: C01, E03, E15**, and the **handover note**.
> "Every task has an owner, a due date and a handover note. Where no deadline exists, it says 'AI target'. It doesn't pretend."

**0:50–1:20 · The shift changes.** Tab 4.
> "This channel is the handover: one card per person per shift. At 8pm Austin, Sam's and Dana's cards flipped to 🌙 'handed over', and done / next / why went onto every open Linear task. Since 7pm, Wei Lin's 🟢 card shows what it carried over, one line per task: due date, 🤖 what the AI already did, ⚠️ what only she decides." Open Wei Lin's thread: "The detail lives in the thread: the IP check, the camera-3 fix, the deploy runbook. No one asked anyone."
> **The live moment:** "These cards edit themselves. Watch Sam's: when I approve the reimbursement, 'Closed' ticks up on the next cycle."

**1:20–2:10 · Live, on the phone (no keyboard).**
1. Paste the drop into `#drops`. Within ~20s the Lead AI replies in the thread: "what changed, for whom", with Linear links. "A fact changed and the right person's task updated."
2. Tab 5, **Sam's decision queue**: "Max 10 a day, each one tap." Tap ✅ on **Reimburse Wei Lin $640**. The thread says "Approved ✅", then the next cycle closes the Linear issue and tells Wei Lin's AI. "Payment is queued in test mode; a human pays. We say that out loud."
3. Tap ✅ on the Rachel invite draft. "Sent ✅" with a link. Tab 6: the invite from "Dana's AI", labelled as AI, with an `.ics`.

**2:10–2:40 · Pick 2–3 scenarios** (table below). Name the rest in one line.

**2:40–3:00 · Honest + Monday.** "Every date, $ and address is checked in code against the sources. When the AI can't know something, like a price with no pricing rules, it leaves a `[PRICE: Sam to decide]` that blocks sending. It runs inside Slack, Linear and Gmail: nothing new to adopt on Monday."

## How to show each scenario (where to click · the line to say)
| # | Scenario | Click | Say |
|---|---|---|---|
| 1 | Factory install | Linear `[ZAP-111] Harbor Point IP addresses` → comment "IP plan checked…" · `[ZAP-110]` camera-3 fix · #handover Raj date draft | "It checked Ken's IP plan against the device list in code: 6 cameras, 6 addresses. It proposed 13:30–16:00 because Raj asked for 13:30 and forklifts move at 16:00. Wei Lin confirms." |
| 2 | Double-booked day | Linear `[ZAP-121] Crestline call clashes…` → "Clash detected from the calendar" · the slots draft in Sam's decision thread | "It spotted the clash itself, and offers Farah three slots computed from the calendar, not made up. Sam's ✅ approves the slots. Priya's AI also sends Wei Lin the one-pager he was never copied on." |
| 3 | Warehouse proposal | #handover Northwind proposal draft · Linear `[ZAP-102]` comment "No pricing rules…" | "All of Maria's open questions in one email. There are no pricing rules in the pack, so it won't invent a price, and the supplier quote is our cost. It waits for Sam's number in the queue." |
| 5 | Hiring | Linear `[ZAP-130] Onboard Jordan` → 6 sub-issues · welcome draft | "Jordan starts Monday with nothing. The checklist became owned tasks; the welcome email waits on one fact only Sam has: where to go at 9am." |
| 9 | Reimbursements | Sam's queue item → ✅ live · Linear `[ZAP-160]` | "It checked the $640 in both sources, says there are no receipts, and after one tap it queues the payment in test mode." |
| 10 | Case studies | Linear `[ZAP-170]` case-study draft · `[ZAP-171]` LinkedIn copy "WAITING" | "An honest draft, cam 5 still bad included, sent to Bayview for approval. The post is held until they approve." |
| 12 | Knowledge walked out | Linear `[ZAP-161] Document how deploy alerts…` → runbook comment | "Alex is on leave. It wrote down how alerts work from the alert emails and chat, and lists what it does NOT know, for Wei Lin to check once." |
| — | Not built (say so) | — | "Shipyard pilot, call engine, advisor deal, grant pilot, event night: not in tonight's data, so we didn't fake them." |

## Fallbacks (label them out loud, never fake them)
- **No hosts' drop at 8:30:** paste `Maria (email): Tom can do Tuesday 3 Nov at 10:00 Austin time for the site call.`, then SAY it's our own test drop. The Lead AI will treat it as a source (D..).
- **The Lead AI doesn't reply within ~30s:** don't wait. Show tab 4/5 instead; the 5-minute cycle will catch it.
- **Wi-Fi dies:** tether to the phone hotspot. Otherwise walk through the proof links that already exist (Linear + #handover): "this is what it did since 6pm".
- **WhatsApp:** not connected tonight (no Twilio key). Slack carries the Singapore updates; say so if asked.
