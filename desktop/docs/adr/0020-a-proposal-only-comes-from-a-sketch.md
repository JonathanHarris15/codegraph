# 20. A proposal only comes from a sketch

Date: 2026-11-06

## Status

Accepted. Removes the direct drawing added in checkpoint 4 (CG-4.2).

## Context

There have been two ways to make a proposal: a person draws it straight onto the
map, or an agent makes it from a sketch. With members working together, a proposal
drawn on a map would have to be a file being edited live on a branch, on one
person's computer. And direct drawing was never the intended way to work.

## Decision

A sketch is the one way in. An agent opens a branch, reads the sketch, and puts
its faint outline over the map. The outline turns solid as its parts become real
code. Nothing shows until the agent puts the outline there.

It never starts on the main line. It can start on a new branch or on one already
in progress. The agent works from the sketch as it read it, and a later edit does
not move the target: looking at those edits and adding them is another round of
work on that branch. The map says when the sketch has changed since.

The outline stays on its own branch, because each branch has its own layout. The
main line carries a small mark saying a proposal is being built, which leads
there. The agent pushes as it goes, so other members watch it fill in, in steps.

To draw a change together, members draw a sketch. A sketch can be started from a
snapshot of the map, so crossing out what is there still works.

## Consequences

The "Propose a change" button and what sits behind it go away.

A person cannot change a proposal on the canvas. They change the sketch and hand
it to the agent again.

Proposal files already on a branch still read as before.
