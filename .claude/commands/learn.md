---
description: Add a one-line rule to CLAUDE.md so the mistake we just hit doesn't repeat
argument-hint: [the mistake, optional]
---
Mistake to learn from: $ARGUMENTS (if empty, use the most recent mistake or failed attempt in this conversation)

1. Write ONE rule, one line, specific to this repo: name the file, command, or API. "Be careful" isn't a rule; "Twilio WhatsApp sandbox: `To` must be `whatsapp:+E164`" is.
2. Add it to the most fitting section of CLAUDE.md. If an existing rule already covers it, sharpen that line instead of adding a new one.
3. If CLAUDE.md is over ~40 lines, prune: delete anything Claude could infer from the code, merge overlapping rules, and drop stale "not built yet" lines.
4. Show the diff, then commit: `git commit -am "CLAUDE.md: learn <topic>"`.
