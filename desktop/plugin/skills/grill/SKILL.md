---
name: grill
description: Grill a plan against a codegraph project's ontology map before it is built — its terms, its accepted decisions and their rules. Use when the person asks to stress-test, grill or sanity-check a plan in a repo with a codegraph.config.json, or before building a change that adds a name, a store, or a reach from one part to another.
---

# Grilling a plan against the ontology map

The ontology map is what the code may be: the project's terms and its accepted ADRs, with their rules. A plan that fights it either changes, or changes the map on purpose.

1. **Load the map.** Read `codegraph/terms/` and `codegraph/adr/`; call the codegraph `map` tool for what the code is now. For how terms and rules read, call the codegraph `instructions` tool with topic `terms`, then topic `decisions`.
2. **Hold every word.** Each thing the plan names is an existing term, an avoid word for one, or a new word. Ask about each one that is not plainly a term.
3. **Hold every reach.** Each new import, call or store the plan adds is held against every accepted rule. Name the rule a reach would break.
4. **Ask one question at a time.** Wait for the answer. Where the person changes the plan, hold the change too.
5. **Write down what was settled.** A new or changed word goes through the `terms` skill; a choice made between options goes through the `decide` skill, as proposed.

Done when every word the plan names and every reach it adds has been held against the map, and each conflict ended in a changed plan or a written change to the map.
