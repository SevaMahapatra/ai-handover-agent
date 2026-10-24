---
description: T-20 before a demo. Stop new work, merge what passes, verify, print the demo line
---
Demo checkpoint in 20 minutes. Do this, in order:

1. Don't spawn anything new. Check on running builders: wait at most 5 minutes for any that are nearly done, and stop the rest.
2. Run `git worktree list` and look at each unmerged branch. Merge only branches whose trigger command passes, one at a time, running the `verifier` after each. Leave the rest unmerged (don't delete them) and say which.
3. Run the `verifier` on main with every trigger command, plus `./preflight.sh`.
4. If the main demo trigger fails, revert the last merge that broke it (`git revert -m 1 <merge>`), and verify again.
5. Commit, then print exactly:
   - **60-second line:** "Card says [X]. New since last round: [Y]. Watch." with X and Y filled in from DEMO.md and the git log since the last checkpoint
   - **Trigger command:** one line, copy-pasteable
   - **What appears on the phone/inbox**
   - **Fallback command** (from DEMO.md) if the live one fails
