---
name: setup
description: Setup for codegraph — set a repo up, or bring an older setup up to what codegraph asks now. Use when the person asks to set a repo up for codegraph, when a repo has no codegraph.config.json, or when codegraph says the setup or the skills are out of date.
---

# Setting a repo up for codegraph

1. **Get the steps.** Call the codegraph `instructions` tool with topic `setup` and follow it whole, on a branch of its own. It asks the person the questions worth stopping for: which projects the repo serves, and whether codegraph's skills go to them or to everyone on the repo.
2. **On a repo already set up, bring it up to now.** Hold what is there against what setup asks today, and do only what is missing:
   - the block in `CLAUDE.md` or `AGENTS.md` matches, word for word, what topic `working-here` gives;
   - terms and ADRs live in `codegraph/terms/` and `codegraph/adr/`, with no `CONTEXT.md` or `docs/adr/` left beside them;
   - every store names a schema; every accepted ADR fills in all six sections;
   - the skills are where the person chose: turned on in `.claude/settings.json`, or installed for them.
3. **Check.** Call the codegraph `check` tool until it lists nothing setup added.

Done when the check lists nothing setup added, the `working-here` block is current, and the person has been told plainly what moved, what was left alone and why, and what they still run themselves.
