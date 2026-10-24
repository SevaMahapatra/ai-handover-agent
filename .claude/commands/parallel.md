---
description: Split a goal into independent tasks, build them in parallel worktrees, merge, verify
argument-hint: [goal]
---
Goal: $ARGUMENTS

Work through these steps in order:

**a) Plan.** Break the goal into tasks. For each one, list: name, owned files, trigger command, and whether it's independent or depends on another task (say which). Show the plan as a table before spawning anything.

**b) Contracts first.** If tasks share an interface (an API route shape, a JSON schema, an event format, a function signature), write that contract file on main now, with a stub implementation that runs, and commit it. Worktrees branch from local HEAD, so **uncommitted work is invisible to builders**: commit anything they need before step d.

**c) File ownership.** Every file has exactly one owner. Shared files (package.json, server.js, CLAUDE.md, .env.example, any routes index) stay with main. If a task needs a dependency or a shared-file edit, main does it in step b.

**d) Spawn.** (If `builder`/`researcher`/`verifier` aren't available as agent types because `.claude/agents/` changed mid-session, use `general-purpose` with `isolation: "worktree"` for builders, and paste the agent file's body into the prompt.) Start up to 3 `builder` subagents in the background, one per independent task, all in the same message. Give each one: the feature, its owned files, the contract files to read, the trigger command, and its own PORT (3101, 3102, 3103). Run dependent tasks one after another, not in parallel. If an API is unfamiliar, run a `researcher` first and paste only its snippet into the builder's prompt.

**e) Merge one at a time.** For each finished branch: `git merge --no-ff <branch>`, resolve any conflicts immediately, then run the `verifier` with that branch's trigger command. Fix FAILs before merging the next branch. BLOCKED (a missing key) is not a merge blocker. The main branch here is `master`. Afterwards, clean up each merged worktree: run `cmd //c rmdir <path>\node_modules` if it's still there (never delete it recursively; it's a junction to main's), then `git worktree remove <path>`, then `git branch -d <branch>`.

**f) Report.** What is live now, what is BLOCKED and on which keys, and the exact command that demos each feature.
