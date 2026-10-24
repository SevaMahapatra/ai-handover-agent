# Hackathon kit
Kit for building live AI demos fast. Likely theme: operational intelligence (factory/warehouse/logistics video + alerts).

Stack: Node 24 (Python is NOT installed). Run commands from the repo root; `.env` is read from cwd.

## Commands
- Vision loop: `node vision/live.js [rules.json] [webcam|file.mp4]`
- Dev server, deploy, ngrok: not built yet (ngrok not installed). Add the exact commands here once they exist.

## Kit functions
| Function | File | Test |
|---|---|---|
| `frames()` / `grabOne()` | vision/capture.js | `node vision/capture.js webcam 3 3` |
| `analyzeFrame(image, rules)` | vision/analyze.js | `node vision/analyze.js vision/out/frame_0.jpg` |
| `sopToRules(pdfOrText)` | vision/sop.js | `node vision/sop.js vision/samples/sop.txt` |
| `alert(event)` | vision/alert.js | `node vision/alert.js` |
| `logEvent()` / `eventsSince()` | vision/log.js | run live.js, then open vision/out/events.json |
| `shiftSummary(minutes)` | vision/summary.js | `node vision/summary.js 60` |
| send / call / book / ship | not built yet | |

## .env (names only; never print values)
No `.env` yet. Expected keys, per .env.example: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VISION_PROVIDER`.

## Rules
- Do the simplest thing that works live. No auth, tests, or DB unless asked.
- Run the code after every change and show the output. Commit after every working step.
- If an API call fails, show the raw error before trying a fix.
- Demo rule: every feature must trigger something visible on a real phone or in a real inbox.
- Gotcha: new worktrees need `.env` copied in and their own `npm install`. Each dev server needs a different port.
