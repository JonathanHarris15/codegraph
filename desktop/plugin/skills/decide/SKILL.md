---
name: decide
description: Decisions — record an ADR in a codegraph repo's codegraph/adr/ on the team's ADR template, with the rules the check holds the code to. Use when the person settles how something should be, weighs options and picks one, overturns an earlier decision, or asks to write an ADR in a repo with a codegraph.config.json.
---

# Recording a decision

In a repo with a `codegraph.config.json`, decisions live one to a file in `codegraph/adr/`, never in `docs/adr/`.

1. **Get the template.** Call the codegraph `instructions` tool with topic `decisions`: the head, the six sections, and the rules the check can hold.
2. **Read what is decided already.** Read `codegraph/adr/` and `codegraph/terms/`. A decision that overturns an earlier one replaces it, and the earlier one's status becomes `replaced`.
3. **Write it proposed.** Fill in every section the conversation settled. Each alternative weighed gets a line saying why it lost, doing nothing among them. Name the terms it settles. Where it says what may reach what, or who alone writes a store, give it a rule.
4. **Hand it to the person.** Say which sections are still thin and what each rule will hold the code to. Accepting it is the person's call, never yours.
5. **Check.** Call the codegraph `check` tool. A rule the code already breaks is said plainly, with what would have to change.

Done when the ADR is written as proposed with every section filled or named as still empty, its terms exist, and the check lists nothing about the file itself.
