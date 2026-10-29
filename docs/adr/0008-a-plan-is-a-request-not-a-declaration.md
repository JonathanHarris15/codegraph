# A plan is a request, not a declaration

Codegraph could only take a new idea in through the chat box. We want a person
to see a change on the map before it is built: the agent turns a ramble or a
ticket into cards and wires, the person looks and approves, the agent builds
it, and the map then shows what was really built.

That change is a **plan**: a file in `plans/`, one per change, listing the
cards and wires to add or change, each card with a few lines of plain words
saying what it is for. The map draws what of it is not built yet as ghosts
over the real map, and marks a ghost red where it breaks a rule. As the code
is written, the ghosts go: a card or wire counts as built once the map, read
from the code alone, has it.

A plan dies when it is built. Once nothing in it is left to build, the file is
deleted, and a plan left behind after that is a mismatch. The tags stay the
only declaration (ADR 0002); a plan only ever says what someone wants, never
what the code is.

A plan may say three things the code does not yet tell codegraph: which
program a card ships in, which roles may start a feature, and what a feature
or a front-door name takes and gives. The map shows them on the ghost, and
does not hold them against the code until codegraph can read them there.

## Considered options

- **Keep plans as a record of intent.** Useful history, but it is
  `codegraph.json` again: a second picture of the architecture that drifts
  from the code. Git history and the ticket already keep what was asked for.
- **Keep plans in the browser and the chat only.** Lighter, but lost when the
  session ends, and nothing else (a ticket, another session) can carry one.
- **Write the plan as tags in new, empty files.** The tags would then claim
  things that are not true yet, and the check would go red for work that has
  not started.

## Consequences

A page's design (a screen, or a page of HTML from Claude Design) lives beside
its plan in `plans/<name>/` and goes when the plan does. Codegraph cannot tell
when a page looks like a picture, so a design stays on its card, unbuilt,
until the agent judges the page matches it and takes it off.

The check reads plans too, so it builds the map to compare them against.
A plan's words for wires are the map's own (CONTEXT.md, Wires), written from
the card that reaches to the card it reaches: `page home acts on feature
plan-service`.
