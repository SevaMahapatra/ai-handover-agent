# Hackathon kit
Kit for building live AI demos fast. Likely theme: operational intelligence (factory/warehouse/logistics video + alerts).

Stack: Node 24 (Python is NOT installed). Run commands from the repo root; `.env` is read from cwd.

## Commands
- Vision loop: `node vision/live.js [rules.json] [webcam|file.mp4]` · preflight: `./preflight.sh` · judge chat ID: `node scripts/chat-id.js`
- Dev server: `node server.js` (worktrees: PORT=3101+) · ngrok: `ngrok http 3000` (not installed: `winget install ngrok.ngrok`) · deploy: `npx vercel --prod`

## Kit functions
| Function | File | Test |
|---|---|---|
| `frames()` / `grabOne()` | vision/capture.js | `node vision/capture.js webcam 3 3` |
| `analyzeFrame(image, rules)` | vision/analyze.js | `node vision/analyze.js vision/out/frame_0.jpg` |
| `sopToRules(pdfOrText)` | vision/sop.js | `node vision/sop.js vision/samples/sop.txt` |
| `alert(event)` | vision/alert.js | `node vision/alert.js` |
| `shiftSummary(minutes)` | vision/summary.js | `node vision/summary.js 60` |
| `scrapeUrl(url)` | kit/scrape.js | `node kit/scrape.js <url>` |
| inbound SMS/call webhook | api/inbound.js | `curl -X POST localhost:3000/api/inbound -d "From=+1555&Body=hi"` |
| `sendWhatsApp(text, to?)` | kit/whatsapp.js | `node kit/whatsapp.js "hi"` (recipient must join the Twilio sandbox first) |
| /status page (last 10 kit events) | api/status.js | open `localhost:3000/api/status` |

## .env (names only; never print values)
All keys are listed in `.env.example`. Values that are still placeholders count as unset (`requireEnv` in kit/env.js). As of now, every key is a placeholder.

## Rules
- Do the simplest thing that works live. No auth, tests, or DB unless asked.
- Run the code after every change and show the output. Commit after every working step.
- If an API call fails, show the raw error before trying a fix.
- Demo rule: every feature must trigger something visible on a real phone or in a real inbox.
- Gotcha: `.claude/agents/` and `.claude/commands/` load at session start, so restart `claude` after editing them.

## Parallel work
- Any goal with 2+ independent parts: use `/parallel`, not sequential building. Agents: builder, researcher, verifier, simplifier.
- Use `researcher` subagents for API docs and log-heavy digging, so the main context stays clean.
- One dev server per port: main uses 3000 and runs the demo; builders use 3101-3103, the verifier 3900.
- Worktrees branch from local HEAD (commit first) and get `.env` via .worktreeinclude. node_modules is a junction to main's: remove it with `cmd //c rmdir`, never `rm -rf`.
- Start large tasks in plan mode. I may /clear between tasks, so keep state in files (CLAUDE.md, DEMO.md, git log), not the conversation.
