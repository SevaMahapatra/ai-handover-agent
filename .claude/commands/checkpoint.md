---
description: T-20 before a check-in (4:30 / 6:00 / 7:30) or the 8:30 hands-off. Stop new work, merge what passes, rehearse the fresh restart, print the demo line
---
Check-in in 20 minutes. They will restart the AI fresh in front of everyone. Do this, in order:

1. Don't spawn anything new. Check on running builders: wait at most 5 minutes for any that are nearly done, and stop the rest.
2. Run `git worktree list` and look at each unmerged branch. Merge only branches whose trigger command passes, one at a time, running the `verifier` after each. Leave the rest unmerged (don't delete them) and say which.
3. **Restart rehearsal, 3 times:** kill every agent process, then run the start command from DEMO.md with nothing typed afterwards. Each run must resume from saved state, ask nobody anything, and redo no work (no duplicate Linear issues, emails, or messages). Fix only what breaks.
4. Run the `verifier` on master with the end-to-end flow plus `./preflight.sh`. If the flow fails, revert the last merge that broke it (`git revert -m 1 <merge>`) and verify again.
5. Commit, update DEMO.md's start command and proof links if they changed, then print exactly:
   - **60-second line:** "The card is the 24/7 Handover. New since last round: [Y]. You restart it." with Y taken from the git log since the last check-in
   - **Start command:** one line
   - **Proof links** it produced in this rehearsal (Linear / Slack / email / calendar)
   - **Fallback** (from DEMO.md) if it stalls
