# Prompt templates: The 24/7 Handover
Copy, fill the [BRACKETS], paste. The brief is in CLAUDE.md. Check-ins (a fresh restart in front of everyone) are at 4:30, 6:00 and 7:30. Hands off at 8:30.

## 1. KICKOFF (plan mode: Shift+Tab)
```
Card: The 24/7 Handover (summary in CLAUDE.md). Break story to target: [e.g. "the call that ends at night"].
Organization: [ONE LEAD AI / A TEAM OF PER-PERSON AIS / A SHARED BOARD], because [WHY].
Plan the smallest loop that works end to end by [TIME]: call notes -> Linear tasks, each with the right owner (Founder, Engineer, Sales caller, Content) -> Slack update -> one follow-up email.
All state lives in files or the tools themselves, so a fresh restart carries on without asking.
Then 3 increments, one per check-in: calendar, WhatsApp, the shift-change pickup.
For each step: the files it touches, the trigger command, and the clickable proof it leaves.
No code until I approve.
```

## 2. JUDGE FRAMING
```
Write the 8:30 pitch for the Zapdos team, who will judge it as their own tool.
What it does: [ONE LINE]. Organization: [LEAD AI / TEAM / BOARD], and why: [REASON].
Map it to their real breakages: [e.g. "the call that ends at night", "the proposal stuck on a price", "the helper that forgets"].
Answer their 4 questions in one line each: right person on each task? Runs end to end, with links? Nothing made up? Would they use it Monday?
One sentence pitch plus 4 lines. No AI jargon, and no claim I can't click to prove.
```

## 3. CHECK-IN PUSH (T-20 before [4:30 / 6:00 / 7:30])
```
Check-in in 20 minutes. They'll restart the AI fresh in front of everyone. Stop all new features.
Rehearse it now: kill every agent process, start fresh with the single command, and watch it resume [CURRENT LOOP] without asking anything.
Run that 3 times. Fix only what breaks: state that isn't persisted, a prompt that asks a question, work done twice.
Give me the one start command and the links (Linear / Slack / email) that prove it carried on. Commit when green.
```

## 4. PARALLEL SPLIT
```
Next increment: [INCREMENT, e.g. "calendar invites + WhatsApp to Singapore"].
Run /parallel. The shared contract is the handover ledger / task schema: [FILE]. Commit it on master first.
One builder per tool integration ([TOOL-A], [TOOL-B]); each owns only its own file.
Run a researcher on any API we haven't used yet ([API]) and paste only its snippet into the builder prompt.
```

## 5. MERGE (T-15 before a check-in or 8:30)
```
Merge every passing branch into master, one at a time, and run the verifier after each.
Then run the end-to-end flow from a fresh start: [START COMMAND].
Show me the proof links it produced (Linear issues + owners, Slack message, email, calendar event).
If anything breaks after T-5, revert that merge rather than debug.
```

## 6. DEBUG
```
Raw error:
[PASTE THE FULL ERROR OUTPUT]
Command I ran: [COMMAND]
What I expected: [EXPECTED]
Diagnose before editing anything. List the 2 most likely causes, and how to check each one
with a single command. Run those checks, tell me which cause it is, then fix that one thing.
```

## 7. RESCUE
```
I've spent 20+ minutes on [PROBLEM] without progress.
Propose the simplest fallback that still does real work in the real tools. For example: the Granola API -> the sample call notes file, WhatsApp -> Slack, a calendar API -> an emailed .ics invite, a team of AIs -> one lead AI with role prompts.
Never fake the output: a fallback must be labelled as one in the demo.
Pick one, build it, run it, show the proof link, and commit. Leave the broken path in place but unused.
```

## 8. HANDS-OFF HARDENING (before 8:30)
```
At 8:30 it runs for 3 minutes with nobody touching the keyboard. Harden [START COMMAND] for that:
- it starts on its own trigger ([NEW GRANOLA NOTE / FILE DROP / SCHEDULE]), not on a keypress
- retry each API call twice, and log the raw error if it still fails
- idempotent: it never creates the same Linear issue or email twice after a restart (the "helper that forgets")
- every message to a person says it's from an AI
- one clear console line per handoff: who, what, the proof link
Run it end to end once, untouched, and show the log.
```

## 9. HONESTY AUDIT
```
Audit the last run for "nothing made up." For every task, message, email and calendar event the AI produced:
name the exact source line it came from (call notes, inbox, Slack, Linear), or flag it as invented.
Fix every invented item: either cite a source or drop it. Check that every outbound message identifies itself as AI.
Show the audit table, then commit.
```

## 10. CLAUDE.md UPDATE
```
You just made this mistake: [WHAT WENT WRONG]. Run /learn with it.
```
