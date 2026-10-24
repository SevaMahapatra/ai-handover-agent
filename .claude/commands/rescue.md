---
description: No progress for 20+ min. Pick the simplest real fallback and build it
argument-hint: [what's stuck]
---
We've been stuck for 20+ minutes on: $ARGUMENTS

1. In 3 lines max, say what's failing and what has already been tried (from the conversation and `git log`).
2. Propose ONE fallback, the simplest that still does something real live and ends on a phone or inbox. Swap the broken piece for one we already have working, for example:
   - webcam → a recorded video file (`vision/samples/*.mp4`)
   - SMS / WhatsApp / a call → Telegram (`vision/alert.js`)
   - Qwen or another VLM → Claude vision (`vision/analyze.js`)
   - a parsed SOP → hardcoded rules (`vision/rules/*.json`)
   - Cal.com → an emailed .ics, or Vercel → `node server.js` + ngrok
3. Build it right away. Leave the broken path in place but unused (no deleting). Run the trigger command, show the output, and commit.
4. Update the trigger command in DEMO.md if it changed.
