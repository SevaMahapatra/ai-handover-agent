# Prompt templates
Copy, fill the [BRACKETS], paste. Kit functions are listed in CLAUDE.md.

## 1. CARD DRAWN (switch to plan mode first: Shift+Tab)
```
Card: "[CARD TEXT]"
Demo moment at 9pm: [WHAT THE JUDGES SEE HAPPEN, e.g. "I hold up a phone, my phone buzzes with the frame"].
Reuse these kit functions: [e.g. frames, analyzeFrame, alert].
Plan:
1. The smallest end-to-end slice with ONE live action on a real phone or inbox, done within 45 minutes.
2. Three increments, one per 90-minute checkpoint, each demoable on its own.
For each step: the files it touches, and the command that proves it works.
Don't write code until I approve the plan.
```

## 2. OPS-MANAGER FRAMING
```
Rewrite what this build does for an operations manager at a [FACTORY / WAREHOUSE / LOGISTICS HUB].
What it does now: [ONE-LINE DESCRIPTION].
Speak in their terms: incidents caught, time from event to alert, hours of manual review saved,
set up by reading their existing safety manual, works with the cameras they already have.
Give me a one-sentence pitch, three bullets, and one number I can say out loud (estimate it, and say how).
No AI jargon.
```

## 3. CHECKPOINT PUSH (T-20 min)
```
Checkpoint in 20 minutes. Stop all new features.
Make the current slice reliable: [THE SLICE, e.g. "webcam -> phone detected -> Telegram alert"].
Run it 3 times in a row and show the output. Fix only what breaks.
Then give me the single exact command that triggers the live action, plus what I should see on [PHONE / INBOX].
Commit when it's green.
```

## 4. PARALLEL SPLIT
```
Next increment: [INCREMENT].
Split it into 2 independent tasks, one per git worktree ([BRANCH-A], [BRANCH-B]).
For each task, list the exact files it creates or edits. No file may appear in both lists;
if a shared file has to change, give it to one task and define the interface the other relies on.
Also start subagents to research these docs in parallel: [API / SDK / DOCS].
Each worktree: copy .env in, run its own npm install, and use its own port ([PORT-A], [PORT-B]).
```

## 5. MERGE (T-15 min)
```
Merge [BRANCH-A] and [BRANCH-B] into main. Resolve any conflicts, keeping both features working.
Then run the trigger command: [COMMAND].
Confirm it works end to end: show the console output and tell me what I should see on [PHONE / INBOX].
If something is broken, revert that branch's merge rather than debugging past T-5.
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
Stop. Propose the simplest fallback that still does something real, live: for example a video file
instead of the webcam, Telegram instead of SMS, Claude vision instead of Qwen, a hardcoded rule instead of a parsed SOP.
It must still end in something visible on [PHONE / INBOX].
Give me one option, implement it, run it, and show the output. Leave the broken path in place but unused.
```

## 8. DEMO HARDENING
```
Harden [SCRIPT, e.g. vision/live.js] for a live demo:
- retry each API call up to 2 times with a short backoff, and print the raw error if it still fails
- keep a per-rule cooldown of [N] seconds
- one clear console line per event: time, verdict, rule, confidence, alert sent or not
- a manual trigger key: pressing [KEY] fires the alert with the current frame, in case the VLM misses on stage
Run it, press the key once, and show the output.
```

## 9. CLAUDE.md UPDATE
```
You just made this mistake: [WHAT WENT WRONG].
Add one short rule to CLAUDE.md that prevents it next time. Be specific to this repo, not generic advice.
Keep CLAUDE.md under 30 lines; if it's full, replace the least useful line. Show the diff, then commit.
```
