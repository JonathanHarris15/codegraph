# 7. A proposal lives on its branch

Date: 2026-11-02

## Status

Accepted.

## Context

A proposal is a change drawn over the map, which an agent builds until the
map matches it. It works like a failing test: what is drawn and not yet in
the code shows as unbuilt, and the agent works until nothing does.

It could be kept in the app beside the sketches, or in the repo it changes.

## Decision

A proposal is a file committed in the repo, on the branch where it is being
built. A branch has at most one, so the canvas on a branch always shows the
map plus that one change, and it is clear what the agent is working toward.

A sketch that changes several software systems becomes one proposal in each,
on a branch in that system's repo. Where the sketch draws a system with no
repo yet, the agent makes the repo first.

The proposal is deleted in the same change that finishes building it, so it
never reaches the main line. The sketch it came from stays in the project as
the record of what was asked for.

## Consequences

Anyone who checks out the branch, person or agent, sees the proposal and how
far it has got, with no app or cloud needed.

Two branches can each carry a proposal and be built at once without stepping
on each other.

Once built, the only trace of a proposal is the sketch and the code. Nothing
reads a finished proposal back.
