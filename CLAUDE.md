# Hackathon kit
Kit for building live AI demos fast. Likely theme: operational intelligence (factory/warehouse/logistics video + alerts).

Stack: Node 24 (Python is NOT installed). Run commands from the repo root; `.env` is read from cwd.

## Commands
- Vision loop: `node vision/live.js [rules.json] [webcam|file.mp4]` · preflight: `./preflight.sh` · judge chat ID: `node scripts/chat-id.js`
- Dev server: `node server.js` (PORT=3001 for a 2nd worktree) · ngrok: `ngrok http 3000` (not installed: `winget install ngrok.ngrok`) · deploy: `npx vercel --prod`

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

## .env (names only; never print values)
`.env` is EMPTY. Expected keys, per .env.example: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VISION_PROVIDER`.

## Rules
- Do the simplest thing that works live. No auth, tests, or DB unless asked.
- Run the code after every change and show the output. Commit after every working step.
- If an API call fails, show the raw error before trying a fix.
- Demo rule: every feature must trigger something visible on a real phone or in a real inbox.
- Gotcha: new worktrees need `.env` copied in and their own `npm install`. Each dev server needs a different port.

## Parallel work
- Any goal with 2+ independent parts: use `/parallel`, not sequential building. Agents: builder, researcher, verifier, simplifier.
- Use `researcher` subagents for API docs and log-heavy digging, so the main context stays clean.
- One dev server per port: main uses 3000 and runs the demo; builders use 3101-3103, the verifier 3900.
- Worktrees branch from local HEAD: commit anything builders need before spawning them.
- Always verify by running the code. Commit after every working step.
- Start large tasks in plan mode. I may /clear between tasks, so keep state in files (CLAUDE.md, DEMO.md, git log), not the conversation.
