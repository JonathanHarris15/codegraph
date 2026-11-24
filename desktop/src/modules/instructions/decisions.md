# Decisions

A set-up repo records each decision about its software as an ADR, one to a file
in `codegraph/adr/`, numbered: `codegraph/adr/0004-a-garment-belongs-to-one-wardrobe.md`.
There is no `docs/adr/` in a set-up repo. Every ADR follows the team's ADR
template: who decided and when in its head, then six sections, always these, in
this order.

## An ADR's file

```markdown
---
adr: 4
status: accepted
date: 2026-11-04
deciders: [Jonathan Harris]
consulted: Claude, while planning closet browsing
area: backend
related: [WARD-38 PRD (Closet browsing)]
replaces: []
terms: [Garment, Wardrobe]
rules:
  - only writer: { store: garments, by: module wardrobe }
  - never reaches: { from: feature outfit-planner, to: module billing }
---
# 4. A garment belongs to one wardrobe

## Context

What problem this solves and why now, and the constraints that matter:
deadline, cost, skills, what exists already.

## Decision

What was chosen, in one or two plain sentences, then what someone needs to act
on it.

## Alternatives

- **A garment in many wardrobes:** why it lost.
- **Do nothing:** why it lost.

## Evidence

What backs it: research, benchmarks, costs, prototypes, test results, links.

## Consequences

- **Good:** what gets easier.
- **Bad:** what gets harder, and new risks.
- **Follow-up work:** what this leaves to do.

## Revisit when

The signal that reopens it: a cost, a count of people, a missed date, a new tool.
```

The head:

- **adr**: its number, the next one free in this repo.
- **status**: `proposed`, `accepted` or `replaced`. A new ADR is proposed; the
  person accepts it. Never accept one yourself.
- **date**, **deciders**, **consulted**, **area**, **related**: who, when, what
  part of the work, and the docs and tickets it came from.
- **replaces**: the ADRs this one overturns. Set the replaced one's status to
  `replaced`. What replaced an ADR is read from the one that replaces it; never
  write it twice.
- **terms**: the terms it settles or leans on, by name. Each must be a term in
  `codegraph/terms/`.
- **rules**: what the code keeps to because of it. The check holds the code to
  the rules of every accepted ADR not replaced by another.

## Rules

Name components the way their tags do: `module wardrobe`, `feature
outfit-planner`, `page closet`. `any page`, `any feature` or `any queue` means
every component of that kind or card type.

- **never reaches**: `{ from: <component>, to: <component or container or outside system> }`
- **only through**: `{ to: <container or outside system or component>, by: <component> }`,
  only that one component reaches it.
- **only writer**: `{ store: <store>, by: <module> }`, only that module keeps the store.

A rule about what is inside a file, such as "no raw colours", cannot be checked
from the map. Write it in the Decision's words instead.

## Writing one

1. **Read what is there.** Read `codegraph/adr/` for a decision that already
   covers this, and `codegraph/terms/` for the words to use. A new decision that
   overturns an old one replaces it; it does not quietly contradict it.
2. **Fill in every section.** An accepted ADR with a section missing or empty
   fails the check. A proposed one may be half written while it is talked over,
   but say which sections are still empty.
3. **Alternatives are real ones.** Each option that was weighed, and why it
   lost, with doing nothing among them.
4. **Give it rules where it has any.** If the decision says what may reach what,
   or who alone writes a store, write that as a rule so the check holds it.
5. **Check.** Call the codegraph `check` tool. Nothing about the new ADR should
   be listed, and the code should already keep its rules, or the ADR stays
   proposed until it does.
