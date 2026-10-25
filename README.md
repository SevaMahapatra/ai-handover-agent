# AI Handover Agent: the 24/7 Handover

Built at the Zapdos Labs hackday (24 Oct 2026). Work gets dropped when it changes hands between Austin and Singapore. Here,
**each teammate has their own AI**, and work hands off through **one shared record** at every shift change, so the next
person's AI carries on exactly where the last one left off, without asking anyone.

No new app: it lives in the tools the team already uses (**Linear, Slack, Gmail/calendar**). The call notes, inbox, Slack
history, WhatsApp and calendar come from the hackday work pack (`work_pack/`, fictional data).

## How it works
```
work pack (calls, email, Slack, WhatsApp, calendar, Linear) + Slack #drops + Sam's decisions
        │
        ▼
Dispatcher (Claude) ── honesty audit in code ──► ledger: what's owed, to whom, by when, owner, sources
        │
        ├─► Linear (team ZAP): one task per obligation · owner label · due · why · next · done/next/why handover notes
        ├─► each person's AI (on shift 08:00–20:00 local): does its part, drafts emails, proposes calendar-derived times
        ├─► Sam's decision queue: max 10 a day, one tap each
        └─► Slack #handover: one live card per person per shift (edits itself); details in its thread
                                  │
                                  └─► Gmail: emails + .ics invites, only after ✅
```

One **cycle** runs on start, every 5 minutes, after each `#drops` message, and after each decision. In order:
1. Read new sources and update the ledger (later facts override, every change cites its source).
2. Sync Linear (owners by role, due dates or a labelled AI target, duplicates closed, closed tasks stay closed).
3. Detect shift changes (per person, in their time zone).
4. Make sure each person has today's handover card.
5. Every open task has a handover note; people signing off leave done / next / why on each open task.
6. Each on-shift AI finishes what it can (at most 6 per cycle, never twice); human-only items go to the owner.
7. Sam's decisions are queued; 7 scenario plug-ins run (`handover/scenarios/`).
8. Cards are re-rendered from live Linear state and edited in place.

## Honesty and restarts
- Every date, $ amount and address the AI writes is checked against the cited sources in code. Anything that fails is
  held back with a "needs a human" note. Unknowns become placeholders such as `[PRICE: Sam to decide]`, which block sending.
- All state lives in Linear, Slack (hidden message metadata) and `state/`. Restarting creates nothing twice.
- Emails go only to the operator's test inbox (pack addresses end in `.example`) and say they're from an AI.

## Run it
```bash
npm install
cp .env.example .env           # Anthropic, Linear, Slack (bot + Socket Mode), Gmail app password
./preflight.sh                 # every service should be PASS
npm start                      # supervisor: keeps the PC awake, restarts on crash, one instance only
```
Create the Slack app from `kit/slack-manifest.yaml`. Other commands: `npm run cycle` (one cycle by hand),
`npm run audit` (every open task has owner + due + handover note), `npm run reset -- --yes` (clean slate).

## Layout
| Path | What |
|---|---|
| `handover/dispatch.js` | Dispatcher: sources → ledger, with the code-side honesty audit; `--update` for new drops |
| `handover/run.js` | One handover cycle (the order above) |
| `handover/listen.js` | Slack Socket Mode listener: drops, questions, ✅/❌ on drafts and decisions |
| `handover/cards.js` · `queue.js` · `shift.js` · `work.js` | Live cards · Sam's decision queue · shift clock · each AI's work |
| `handover/scenarios/` | Plug-ins for the efficiency-doc scenarios (install, double booking, proposal, onboarding, reimbursement, case study, runbook) |
| `kit/` | Thin clients: Linear, Slack, Gmail, `.ics`, calendar slot finder, Claude |
| `scripts/` | Supervisor, preflight, Linear audit, reset |
| `DEPLOY.md` | Running it on a server (Dockerfile, untested) |

## Not done (yet)
WhatsApp sending (no provider connected) · per-person DMs (owners are Linear labels, not users) · Granola via its API
(the work pack's call notes stand in) · hosted deployment.
