# Deploying the handover AI

The whole workflow is ONE long-running process: `node handover/listen.js`.
- It opens an **outbound** WebSocket to Slack (Socket Mode). There's no public URL, no inbound port, and no web server.
- It runs a handover cycle on startup, after each `#drops` message, and every `CYCLE_MINUTES` (default 5).
- Its state is the `state/` folder (ledger, shift state, drafts) plus what's already in Linear, Slack, and Gmail.

So it needs an **always-on container with a small persistent disk**. Serverless hosts (Vercel functions, Lambda) can't hold the socket open.

**Run exactly one instance.** If two listeners connect to the same Slack app, Slack splits events between them and both run cycles. Stop the laptop supervisor before starting a cloud copy.

## Tonight: the laptop (this is the deployment for the demo)
```
node scripts/supervise.js
```
- Keeps Windows awake while it runs: it calls `SetThreadExecutionState` and doesn't change any power setting. **Closing the lid can still sleep the laptop.**
- Restarts the listener 3 seconds after a crash. Logs go to `state/listen.log`.
- Refuses to start a second copy (`state/supervisor.lock`).
- Stop it with Ctrl+C, or `taskkill /PID <pid in state/supervisor.lock> /T /F`.

## Later, optional: cloud (Railway shown; any always-on container host works)
The Dockerfile here is UNTESTED: Docker wasn't available on the build laptop. Expect to fix small things on the first deploy.
On an empty volume, the container copies `deploy/ledger.seed.json` in before the listener starts, so no manual seeding is needed. Refresh the seed before deploying: `cp state/ledger.json deploy/ledger.seed.json`.
1. **Install the CLI and log in:** `npm i -g @railway/cli` -> `railway login` -> `railway init` (new project).
2. **Variables:** paste the contents of `.env` into the service's Variables (Raw Editor), or `railway variables --set KEY=value` per key. Needed: ANTHROPIC_API_KEY, LINEAR_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD, MY_EMAIL, and optionally CYCLE_MINUTES.
3. **Volume:** add a volume mounted at `/app/state`.
4. **Deploy:** `railway up` (builds the Dockerfile). Watch the logs for `socket: connected` and the startup `cycle:` line.
5. **Stop the laptop supervisor**, so only one listener is running.

Cost and limits: whatever the host charges for one small always-on container. It's idle except for cycles; each cycle is a few Claude calls, plus up to 6 work items per person on shift.

## What doesn't move to the cloud
- `work_pack/` is baked into the image. New drops arrive through Slack `#drops`, and the listener writes them to `work_pack/drops/` inside the container. Put that folder on the volume as well if drops must survive a redeploy.
- The camera pipeline (`vision/`) and `preflight.sh --vision` are laptop-only.
