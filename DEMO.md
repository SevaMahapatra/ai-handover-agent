# Demo runbook: The 24/7 Handover (8:30, 3 min, nobody touches the keyboard)

**Run it:** `npm start` in your own terminal (the supervisor: keeps the PC awake, restarts on crash, one copy only).
It resumes from `state/` + Linear + Slack, and a restart posts nothing twice. Stop it with Ctrl+C.

**Proof links:** Linear https://linear.app/sevamahapatra/team/ZAP · Slack #handover https://sevas-team.slack.com/archives/C0CBQQYD3PD · #drops https://sevas-team.slack.com/archives/C0CBQQXRM99 · Gmail (emails from "<Name>'s AI")

## Prep (8:10–8:25)
1. `npm start`. Wait for `socket: connected` and a `cycle:` line. Then `./preflight.sh` (ALL GREEN) and `npm run audit` ("0 open issue(s) missing something").
2. **Laptop tabs, in this order** (mouse only):
   1. `work_pack/work_pack/calls/C01.md`: the Granola notes for the Northwind call
   2. Linear ZAP board, **grouped by label** (Sam / Wei Lin / Dana / Priya)
   3. Linear `[ZAP-102] Northwind price`
   4. Slack `#handover`: the 4 handover cards (Sam and Dana 🌙 since 8pm, Wei Lin and Priya 🟢 since 7pm) + 🗂️ Sam's decisions
   5. Gmail inbox
3. **Phone:** Slack open on `#drops`, with the drop text copied (the hosts' 8:30 drop, or the fallback below).
4. For the live ✅, pick a draft with **no** `[PLACEHOLDER]`: Dana's draft to Rachel (Cedar engineer call) in Dana's card thread.

## The 3 minutes
**0:00–0:20 · The problem.**
> "6pm Austin: a warehouse lead wants a layout and a price by Thursday. Austin logs off, Singapore wakes up, and things get dropped. Tonight every teammate has their own AI, and they hand off through one shared record. Nobody here is typing; it has run on its own since 6."

**0:20–0:50 · A call ends → work gets made.** Tab 1, then tab 2, then tab 3.
> "Granola notes from the Northwind call. The dispatcher read the whole week, 70 sources, and turned every obligation into a Linear task with the right owner: price → Sam, layout → Wei Lin, the call with Tom → Dana, the VP one-pager → Priya."

On `[ZAP-102]`, point at **Due**, **Based on**, and the **handover note**:
> "Owner, due date, why, next step, and where every fact came from. No deadline in the sources? It says 'AI target'. It doesn't pretend."

**0:50–1:20 · The shift changes.** Tab 4.
> "This channel is the handover: one card per person per shift. At 8pm Sam's and Dana's AIs signed off 🌙 and left done / next / why on every open task. Wei Lin's 🟢 card shows what she picked up: one line per task, 🤖 what her AI already did, ⚠️ what only she decides. The detail is in the thread. Nobody asked anyone."

**1:20–2:10 · Live, from the phone.**
1. Paste the drop into `#drops`. In ~20–30s, 👀 then "📥 **Read it.** N updates" with Linear links.
   > "A fact changed. The right person's task updated, and it says why."
2. Open 🗂️ **Sam's decisions** and tap ✅ on **Approve and reimburse Wei Lin $640**. You'll see "✅ Approved", the Linear task closes, and Sam's card shows 🔒 Closed.
   > "Only humans decide money, prices and approvals. Each decision arrives ready: one tap. Payment is queued in test mode, and a human pays."
3. Tap ✅ on Dana's draft to Rachel. "📤 Sent · open in Gmail", then tab 5: the email from **Dana's AI**, with a calendar invite.
   > "Nothing goes out without a ✅. Every email says it's from an AI, and the times come from the real calendar."

**2:10–2:40 · Two or three scenarios** from the table below. Name the rest in one line.

**2:40–3:00 · Honest + Monday.**
> "Every date, $ and address is checked in code against the sources. When the AI can't know something, like a price with no pricing rules, it leaves a placeholder that blocks sending. It lives in Slack, Linear and Gmail: nothing new to adopt on Monday."

## Every scenario from the brief and the efficiency doc
| Scenario (source) | Do | They see | Say |
|---|---|---|---|
| The call that ends at night (brief) | Tabs 1–3 above | Owners, due, handover note, "Based on" | "Every piece has the right owner; nothing is made up." |
| The shift changes (brief, 8:30 chain) | Sam's 🌙 card and thread, Wei Lin's 🟢 card | "🌙 Sam signed off", badges per task | "Singapore carried on without asking." |
| The money that sits (brief + doc #9) | ✅ on the $640 item in Sam's decisions | "✅ Approved", task closed, card 🔒 | "$640 checked in both sources, no receipts in the pack, one tap queues it." |
| Things go out (brief, 8:30 chain) | ✅ on Dana's draft to Rachel → Gmail | "📤 Sent", email + invite from Dana's AI | "Only after ✅, always labelled AI." |
| The double-booked afternoon (brief + doc #2) | Linear `[ZAP-121]` → "Clash detected from the calendar"; the 3-slot draft in Sam's decisions | Three PROPOSED slots for Farah | "It spotted the clash itself; Sam's ✅ approves the slots." |
| The promise nobody else saw (brief) | Priya's draft to Wei Lin (Crestline one-pager), in Priya's card thread | "You weren't cc'd" | "The engineer has the one-pager before the call." |
| The proposal stuck on a price (brief + doc #3) | The Northwind proposal draft in Sam's card thread; tap ✅ | "✋ Not sent yet. Fill in [PRICE: Sam to decide] first." | "No pricing rules, so no invented price. The supplier quote is our cost." |
| The person on leave (brief + doc #12) | Linear `[ZAP-161]` → the runbook comment | Facts with sources, plus "What's NOT known" | "Alex is on leave; it wrote down what the alert emails show, and what it doesn't know." |
| The helper that forgets (brief) | Before 8:30 or when asked: Ctrl+C, then `npm start` | It reconnects; 0 duplicates; cards keep updating | "Restart it: it carries on and drafts nothing twice." |
| Factory install (doc #1) | Linear `[ZAP-111]` → "IP plan checked"; `[ZAP-110]` camera-3 fix; Raj's date draft | 6 cameras ↔ 6 addresses; PROPOSED 13:30–16:00 | "It checked IT's details against our device list, and proposed a start that fits the forklifts." |
| Hiring (doc #5) | Linear `[ZAP-130]` → 6 sub-issues; the welcome draft | Owned checklist due Mon 26 Oct | "The email waits on one fact only Sam has: where to go at 9am." |
| Case studies (doc #10) | Linear `[ZAP-170]` draft; `[ZAP-171]` LinkedIn copy | "DRAFT, not public until Bayview approves", "WAITING" | "Honest, cam 5 included; the post is held until they say yes." |
| Not in tonight's data (doc #4 #6 #7 #8 #11) | Say it | — | "Shipyard pilot, call engine, advisor deal, grant pilot, event night: not in the work pack, so we didn't fake them." |

## Fallbacks (say them out loud, never fake them)
- **No hosts' drop at 8:30:** paste `Maria (email): Tom can do Tuesday 3 Nov at 10:00 Austin time for the site call.` and SAY it's our own test drop.
- **No Lead AI reply in ~30s:** don't wait. Show tab 4; the next 5-minute cycle catches it.
- **A tap shows nothing:** every ✅/❌ gets a reply in its thread; if none, show the cards and move on.
- **Wi-Fi dies:** tether to the phone hotspot. Otherwise walk through the links that already exist: "this is what it did since 6pm".
- **Asked about WhatsApp:** not connected tonight (no provider key); Slack carries the Singapore updates.
