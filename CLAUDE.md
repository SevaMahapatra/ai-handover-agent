# Zapdos hackday: The 24/7 Handover (full brief: `D:/Personal/Zapdos_24-7_Handover_hackday_onepager_2026-10-24.pdf`)
- **Problem:** work gets dropped at shift change (Austin <-> Singapore, ~13h apart): what's done, what's next, and why.
- **Build:** each teammate gets their own AI, and work hands off to the right person's AI, which carries on without asking anyone.
- **Team:** Founder (Austin: sales, pricing, investors) · Engineer (SG: installs, layouts, deploys) · Sales caller (US: calls, meetings) · Content (SG: posts, videos).
- **Loop:** Granola call notes -> Linear tasks (right owner on each) -> Slack update -> email -> calendar -> WhatsApp (SG, bonus) -> shift change -> the right AI finishes its task.
- **Schedule:** check-ins 4:30 / 6:00 / 7:30 restart the AI fresh (it must carry on, not ask) · 8:30 hands off: 3 min live, nobody touching the keyboard.
- **Judged on:** the right person on each task + carries on · end to end with clickable proof · nothing made up · usable Monday.
- **Out of scope:** cameras/hardware (vision/ is parked), real customers or live accounts, a pretty UI, a new chat app. Anything that talks to a person says it's AI.
- **Stack:** Node 24 (Python is NOT installed). Run commands from the repo root; `.env` is read from cwd.

## Commands
- Preflight: `./preflight.sh` · demo runbook: DEMO.md · prompt templates: PROMPTS.md
- Dev server: `node server.js` (worktrees: PORT=3101+) · ngrok: `ngrok http 3000` (not installed: `winget install ngrok.ngrok`) · deploy: `npx vercel --prod`

## Kit functions
| Function | File | Test |
|---|---|---|
| `scrapeUrl(url)` | kit/scrape.js | `node kit/scrape.js <url>` |
| inbound SMS/call webhook | api/inbound.js | `curl -X POST localhost:3000/api/inbound -d "From=+1555&Body=hi"` |
| `sendWhatsApp(text, to?)` | kit/whatsapp.js | `node kit/whatsapp.js "hi"` (recipient must join the Twilio sandbox first) |
| /status page (last 10 kit events) | api/status.js | open `localhost:3000/api/status` |
| Not built yet: Granola, Linear, Slack, email, calendar | | |

## .env (names only; never print values)
All keys are listed in `.env.example`. Values that are still placeholders count as unset (`requireEnv` in kit/env.js). As of now, every key is a placeholder.

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
