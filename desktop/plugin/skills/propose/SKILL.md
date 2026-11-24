---
name: propose
description: Proposals — build the proposal on this branch, or make one from a codegraph project's sketch. Use when codegraph-proposal/ is on the branch, when the person hands over a sketch to build, or when the check fails because a proposal is not built yet.
---

# Making and building a proposal

A proposal is a sketch being made real on one branch: the check fails until every card it draws exists and everything it crosses out is gone.

1. **Get the steps.** Call the codegraph `instructions` tool with topic `proposals`. For drawing or reading a sketch, topic `sketches`.
2. **Make it, when starting from a sketch.** Read the sketch with the codegraph `sketch` tool and make the proposal on a branch of its own, one for each repo it changes.
3. **Build it card by card.** Call the codegraph `working-on` tool with the card you are building so the person sees where you are. Build each part in the component the proposal draws it as.
4. **Check after each card.** Call the codegraph `check` tool; the outline turns solid as each part becomes real.

Done when the check lists nothing for the proposal: everything it draws exists, everything it crosses out is gone, the tests pass and every file is tagged.
