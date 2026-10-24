# Zapdos hackday: The 24/7 Handover (full brief: `D:/Personal/Zapdos_24-7_Handover_hackday_onepager_2026-10-24.pdf`)
- **Problem:** work gets dropped at shift change (Austin <-> Singapore, ~13h apart): what's done, what's next, and why.
- **Build:** each teammate gets their own AI, and work hands off to the right person's AI, which carries on without asking anyone.
- **Team:** Founder (Austin: sales, pricing, investors) · Engineer (SG: installs, layouts, deploys) · Sales caller (US: calls, meetings) · Content (SG: posts, videos).
- **Loop:** Granola call notes -> Linear tasks (right owner on each) -> Slack update -> email -> calendar -> WhatsApp (SG, bonus) -> shift change -> the right AI finishes its task.
- **Schedule:** check-ins 4:30 / 6:00 / 7:30 restart the AI fresh (it must carry on, not ask) · 8:30 hands off: 3 min live, nobody touching the keyboard.
- **Judged on:** the right person on each task + carries on · end to end with clickable proof · nothing made up · usable Monday.
- **Out of scope:** cameras/hardware (vision/ is parked), real customers or live accounts, a pretty UI, a new chat app. Anything that talks to a person says it's AI.
- **Decided:** no new app. Linear = shared board (each person's AI acts only on its person's issues); a dispatcher turns calls/email/Slack drops into owned issues citing sources; at shift change the outgoing AI comments done/next/why and the incoming AI carries on. Slack = where people see it. Calendar = emailed .ics. Data: `work_pack/work_pack/` (Granola = calls/). No LangSmith.
- **Stack:** Node 24 (Python is NOT installed). Run commands from the repo root; `.env` is read from cwd.

## Commands
- Preflight: `./preflight.sh` · demo runbook: DEMO.md · prompt templates: PROMPTS.md
- `.env`: key names only, never print values. Placeholders count as unset (`requireEnv`, kit/env.js). Slack uses Socket Mode: no ngrok or deploy.

## Kit functions
| Function | File | Test |
|---|---|---|
| `sendWhatsApp(text, to?)` | kit/whatsapp.js | `node kit/whatsapp.js "hi"` (recipient must join the Twilio sandbox first) |
| Dispatcher: sources -> `state/ledger.json` (owners, citations, honesty audit) | handover/dispatch.js | `node handover/dispatch.js` (~100s) · drops: `--update` (~17s) |
| Linear sync, ZAP team only, idempotent | kit/linear.js | `node kit/linear.js` (2nd run: 0 created) |
| Slack `postAs` / `ensureChannels` / `findMessage` | kit/slack.js | `node kit/slack.js` (#handover, #drops) |
| `sendEmail` (always to GMAIL_USER) + `.ics` invite | kit/email.js, kit/ics.js | `node kit/email.js` |
| Shift-change worker `runCycle()` (handover notes, AI work, drafts, asks) | handover/run.js, shift.js, work.js | `node handover/run.js [--now <ISO>]` (2nd run: 0 new) |
| **Start command**: Slack Socket Mode listener (#drops, @mentions, ✅/❌ drafts, 5-min cycles) | handover/listen.js | `node handover/listen.js` |

## Rules
- Do the simplest thing that works live. No auth, tests, or DB unless asked.
- Run the code after every change and show the output. Commit after every working step.
- If an API call fails, show the raw error before trying a fix.
- Demo rule: every step leaves clickable proof in a real tool (a Linear issue, a Slack message, an email, a calendar event), traceable to a source line.
- Restart-safe: all state lives in files or the tools themselves, never in a process's memory. Resuming must not redo work.
- Gotcha: `.claude/agents/` and `.claude/commands/` load at session start, so restart `claude` after editing them.

## Parallel work
- Any goal with 2+ independent parts: use `/parallel`, not sequential building. Agents: builder, researcher, verifier, simplifier.
- Use `researcher` subagents for API docs and log-heavy digging, so the main context stays clean.
- One dev server per port: main uses 3000 and runs the demo; builders use 3101-3103, the verifier 3900.
- Worktrees branch from local HEAD (commit first) and get `.env` via .worktreeinclude. node_modules is a junction to main's: remove it with `cmd //c rmdir`, never `rm -rf`.
- Start large tasks in plan mode. I may /clear between tasks: keep progress in files (DEMO.md, git log), not the conversation.
