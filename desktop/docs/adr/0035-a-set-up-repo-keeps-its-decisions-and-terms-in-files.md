# 35. A set-up repo keeps its decisions and terms in files

Date: 2026-11-24

## Status

Accepted. Adds a folder to what a set-up repo carries (ADR 0008).

## Context

A project's ADRs and glossary are where its guardrails live: which part may
reach which, which module alone writes a store, what a garment is and what it
belongs to. Today they are prose, in `docs/adr/` and `CONTEXT.md`. People and
agents read them, and nothing holds the code to them. The check holds code
only to the rules every set-up repo shares, and those are written into the
check itself: a module never reaches a feature, nothing reaches into a page.

The two point at each other all the time. An ADR settles what a term means,
and a term is often only clear once you have read the ADR that made it.

Three homes were weighed: one `CONTEXT.md` given a strict format, the app, or
files in the repo.

## Decision

### The folder

Setup makes a `codegraph/` folder at the root of the repo, holding:

- `codegraph/adr/`: one ADR to a file, numbered as now:
  `0004-a-garment-belongs-to-one-wardrobe.md`.
- `codegraph/terms/`: one term to a file, named for the term: `garment.md`.

The config stays at the root as `codegraph.config.json` (ADR 0008), and so
does DESIGN.md, where ADR 0024 put it so other tools can find it.

Every file in both folders is Markdown with a YAML head. The head is what the
check reads. The body is prose for people and agents, and no rule is ever read
from it.

### A term

```markdown
---
term: Garment
store: garments
points at:
  - term: Wardrobe
    how many: one
    says: the wardrobe it hangs in
  - term: Category
    how many: one
avoid: [item, piece, clothing]
settled by: [4]
---
One piece of clothing a person owns. A pair of socks is one garment.
```

- **term**: its name, as people say it.
- **store**: the store whose records are this term, where there is one. A term
  like *Waiting* has none.
- **points at**: the other terms its records point at, how many (`one`,
  `none or one`, `many`), and the words for that wire. It is written once, on
  the term whose records do the pointing: Outfit says it points at many
  Garments, and Garment says nothing about outfits.
- **avoid**: words people reach for that mean this term, and must not be used
  for it.
- **settled by**: the ADRs that decided it.

### An ADR

An ADR follows the team's ADR template: who decided and when in its head,
then six sections under its title, always these, in this order.

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

Garments were being written from three places, and two of them could leave a
garment in two wardrobes at once.

## Decision

A garment belongs to exactly one wardrobe. Only the wardrobe module writes
garments, so moving one is one function, with its access check beside it.

## Alternatives

- **A garment in many wardrobes:** every count and outfit would have to say
  which wardrobe it means.
- **Do nothing:** garments in two wardrobes are already in the test data.

## Evidence

Two garments in the seed data sat in two wardrobes after an import.

## Consequences

- **Good:** one place to move a garment and check who may.
- **Bad:** sharing a coat between two wardrobes means a copy.
- **Follow-up work:** route the import through the wardrobe module.

## Revisit when

More than a few people ask to share garments between wardrobes.
```

The head:

- **status**: proposed, accepted, or replaced.
- **date**: the day it was decided, as `YYYY-MM-DD`.
- **deciders**: who made the decision.
- **consulted**: who was asked, and while doing what.
- **area**: the part of the work it is about, in a few words: backend,
  frontend, data, AI, infra.
- **related**: the docs and tickets it came out of.
- **replaces**: the ADRs this one overturns. Their rules stop applying. What
  replaced an ADR is read from the one that replaces it, never written twice.
- **terms**: the terms it settles or leans on.
- **rules**: what the code keeps to because of this decision. The first kinds:
  - **never reaches**: a component, or every component of a kind or card
    type (`any queue`), never reaches another.
  - **only through**: only the named component reaches a container or an
    outside system.
  - **only writer**: only the named module writes the store.

Components are named the way their tags name them: `module wardrobe`,
`feature outfit-planner`. Only an accepted ADR's rules apply.

The sections:

- **Context**: the problem, why now, and the constraints that matter:
  deadline, cost, skills, what exists already.
- **Decision**: what was chosen, in one or two plain sentences, then what
  someone needs to act on it. The part the check can hold is its rules.
- **Alternatives**: every other option weighed, doing nothing among them, one
  to a line: `- **Option:** why it lost`.
- **Evidence**: what backs it: research, benchmarks, costs, prototypes, test
  results, links.
- **Consequences**: `- **Good:**`, `- **Bad:**` and `- **Follow-up work:**`,
  one line each.
- **Revisit when**: the signal that reopens it: a cost, a count of people, a
  missed date, a new tool.

### What the check does with them

- **A term with a store**: the store's shape points at the store of each term
  under `points at`, one or many as it says. A shape the reader cannot see is
  unknown, not a mismatch (ADR 0023).
- **A name in the code** (a component or a name on its front door, a
  container, a store, a field) made of one of a term's avoid words is a
  mismatch that names the term. A term that says `one` needs a field every
  record has; `none or one` lets it be left out.
- **A rule the code breaks** is a mismatch that names the ADR: "feature
  outfit-planner reaches module billing; ADR 4 says it never does."
- **A term or ADR that names one that is not there** is a mismatch.
- **An accepted ADR with a section missing or left empty** is a mismatch that
  names the section. A decision is written out in full before it is accepted;
  a proposed one may be half written.

The rules every set-up repo shares stay in the check. A repo's own rules only
add to them, and never loosen them.

## Considered options

- **One `CONTEXT.md`, given a strict format.** One file to read top to
  bottom. But every change to any term touches the same file, and prose and
  structure tangle in a format of our own that no other tool reads.
- **Terms as JSON.** Easy to read in code. But a definition is prose, and JSON
  keeps it on one line full of `\n`, with no comments, and unreadable in a
  diff.
- **In the app, beside the project.** One copy for every repo on a project,
  with room for codegraph to grow into the place development happens. But a
  rule saved in the app applies at once, before the code that keeps it is
  merged, so `main` and every branch fail together; no change to a rule shows
  in a pull request; and a check run away from the app needs a way in. In the
  repo, a rule and the code that keeps it land in one change.
- **Files in the repo, Markdown with a YAML head.** Chosen. Terms and ADRs are
  the same kind of file, each change is its own diff, and a proposal can carry
  a new rule together with the code that keeps it.

## Consequences

A project's ADRs, rules and terms, read from every one of its repos, are its
**ontology map**: the map says what the code is, and the ontology map says what
it may be.

The code is still the architecture: no file here says what the code is
(legacy ADR 0002). Terms and rules say what the code may be, and the check
holds it to them.

Setup turns a repo's `CONTEXT.md` and `docs/adr/` into these folders and
removes the old files, so there is only one copy. The block a set-up repo
carries in its own context file points agents at `codegraph/terms/` and
`codegraph/adr/`, and the codegraph MCP hands them out too.

A proposal can add or change terms and ADRs. They are files on its branch, so
its new rules hold its own code at once, and everyone else's once it is
merged.

A term more than one repo uses is settled in ADR 0036.

Codegraph's own `desktop/` keeps `CONTEXT.md` and `docs/adr/` until it is set
up for the new codegraph (plan, checkpoint 5). Its ADRs are written in an older
shape (Context, Decision, Considered options, Consequences); setting it up
moves them into the template's six sections, filling in what they lack.

An ADR's sections are the team's ADR template, the one their docs already use,
so a decision reads the same in the repo, in the app's dictionary, and in the
docs it came from.

Further kinds of rule, such as a page that must use the design system, come in
ADRs of their own. A rule about what is inside a file, such as "no raw
colours", needs something that reads the code, as the design check does, and
cannot be checked from the map alone.
