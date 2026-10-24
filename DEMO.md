# Demo runbook: The 24/7 Handover
Schedule: 3:00 doors · **4:30 / 6:00 / 7:30** check-ins (they restart the AI fresh: carries on = bell, stuck or asks = drink) · **8:30 hands off** (3 min, live, nobody touches the keyboard) · winner at 9.

Fill these in once they exist:
- **Start command:** `node handover/listen.js` (resumes from state/ + Linear + Slack; reruns create nothing twice)
- **Trigger:** paste the hosts' drop into Slack `#drops` (a phone works, so no keyboard). The Lead AI replies in the thread with what changed.
- **Shift change:** real clock, 08:00–20:00 local per person. 7:00pm Austin = Wei Lin + Priya ON (pick up); 8:00pm Austin = Sam + Dana OFF (handover notes). Rehearse with `node handover/run.js --now <ISO>` (labelled simulated).
- **Proof links:** Linear https://linear.app/sevamahapatra/team/ZAP · Slack #handover https://sevas-team.slack.com/archives/C0CBQQYD3PD · #drops https://sevas-team.slack.com/archives/C0CBQQXRM99 · Gmail (invites from "<Name>'s AI")

## Before every check-in (T-10 min)
1. `./preflight.sh`: everything you'll use must be PASS.
2. Rehearse the restart once: kill all agent processes, run `[START]`, and confirm it resumes without asking.
3. Have these open:
   - **Terminal**: `[START]` typed in, big font. One terminal per person's AI if they run separately.
   - **Browser tabs**: the Linear board (filtered to this loop), the Slack channel, the inbox, the calendar week view, and `/status` (the handover ledger).
   - **Phone**: WhatsApp with the Twilio sandbox chat open, for the Singapore message.

## Check-in script (60s)
> "The card is the 24/7 Handover. New since last round: **[Y]**. You restart it."

They restart it. It carries on: point at the **[NEW LINEAR ISSUE / SLACK MESSAGE]** it just produced.
> "It knew **[what's owed, to whom, by when]** from **[the ledger / Linear]**, not from me."

If it stalls, say so. Honesty is judged.

## 8:30 final demo (3 min, hands off)
Start `[START]` before 8:30, then keep your hands off the keyboard.
1. **(20s) The problem, in their words.** "6pm Austin, a warehouse lead wants a layout and a price by Thursday. Austin logs off, Singapore wakes up. Who knows what's owed?"
2. **(40s) A call ends.** Notes land in Granola. Click the Linear tasks: layout → Engineer, price → Founder, invite → Sales caller.
3. **(30s) People hear about it.** Click the Slack update and show WhatsApp on the phone.
4. **(30s) Things go out.** Click the follow-up email (it says it's from an AI) and the calendar invite.
5. **(40s) The shift changes.** [SHIFT] → Singapore's AI picks up the Engineer's task and finishes it. Click the result.
6. **(20s) Why it's organized this way,** and "every item links back to a line in the call notes."

## Fallbacks (label them out loud, never fake them)
- **Granola API down:** use the sample call notes file. Say "same pipeline, notes from a file".
- **A tool fails mid-demo:** `/status` shows the ledger entry with the raw error. Show it, and keep going.
- **Wi-Fi dies:** tether to a phone hotspot first. Otherwise walk through the proof links from the last check-in run.

## WhatsApp sandbox for a judge (1 min)
1. The judge sends `join [SANDBOX-CODE]` to +1 415 523 8886 on WhatsApp.
2. `node kit/whatsapp.js "Hi, this is the handover AI." +[JUDGE-NUMBER]`
