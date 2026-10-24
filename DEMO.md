# Demo runbook

## Before every demo (T-10 min)
1. `./preflight.sh`: everything you'll use must be PASS.
2. Close anything holding the webcam (Camera app, Zoom, Teams, an old live.js).
3. Have these open:
   - **Terminal 1** (big font, repo root): the trigger command typed in, not yet run.
   - **Terminal 2**: `node vision/summary.js 60` typed in, ready for the log/summary beat.
   - **Phone**: the bot chat open, sound ON, Do Not Disturb OFF, screen brightness up.
   - **Browser**: `vision/out/events.json`, and the last alert's frame from `vision/out/frames/`.
   - **Prop**: the phone (or [FORBIDDEN ITEM]) you hold up, plus the fallback video recorded (below).

## 60-second checkpoint script
> "The card says **[CARD TEXT]**. New since last round: **[Y]**. Watch."

Run: `node vision/live.js [RULES.json]` → hold up [ITEM] → phone buzzes with the frame and the rule.
> "That alert came from **[RULE, e.g. a rule read from their safety manual]**, about **[N]** seconds after it happened."

Stop there. One trigger, one result.

## Final 9pm demo (2–3 min)
1. **Problem (30s), in ops-manager terms.** "[FACILITY] has [N] cameras that nobody watches live. Incidents get found hours later, on review. We read their existing safety manual and watch the cameras they already have."
2. **Live trigger (60s).** Get the judge's chat ID (below), then run:
   `TELEGRAM_CHAT_ID=<mine>,<judge> node vision/live.js [RULES.json]`
   Break the rule on camera, and the **judge's phone** buzzes with the frame.
3. **Log / shift summary (30s).** In Terminal 2, run `node vision/summary.js 60`: "Here's what the shift supervisor gets at handover."
4. **Real facility (15s).** "Point it at the existing RTSP feeds instead of a webcam, load the plant's SOP PDF, and alerts go to the shift lead's phone. No new hardware."

## Pre-recorded fallback (webcam or Wi-Fi dies)
Record it **now**, while things work. Hold up the phone for about 5 of the 20 seconds:
```
node_modules/ffmpeg-static/ffmpeg.exe -f dshow -i video="Integrated Webcam" -t 20 -vf scale=960:-2 vision/samples/demo.mp4
```
Run the same pipeline on the file: `node vision/live.js vision/rules/phone.json vision/samples/demo.mp4`
- If only the webcam failed, the alert still reaches the phone. Say it out loud: "same pipeline, recorded feed".
- If Wi-Fi failed, nothing reaches Claude or Telegram. Tether to a phone hotspot first. As a last resort, show the frames and `events.json` from an earlier run.

## Judge's Telegram chat ID (under 1 min)
1. Show the judge a QR code for, or tell them, `t.me/[YOUR_BOT_USERNAME]`. They tap **Start**.
2. Run `node scripts/chat-id.js`: newest chat first, with the ID in the first column.
3. Use it inline: `TELEGRAM_CHAT_ID=<mine>,<judgeID> node vision/live.js ...` (an inline value overrides `.env`).
4. Optional: send them a test with `TELEGRAM_CHAT_ID=<judgeID> node vision/alert.js` first.
