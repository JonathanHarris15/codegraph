# 17. Shift picks annotations outside the open card

Date: 2026-11-06

## Status

Accepted. Loosens ADR 0012.

## Context

ADR 0012 put only the innermost open card in hand, so that a press could not land
on the wrong level. Annotations out around the open card could only be reached by
backing out, which closes the card being worked in. Not every drawing is an
architecture: some are diagrams of anything at all, where the annotations are the
drawing, and they have to be reachable from wherever a person is.

## Decision

Holding Shift and dragging draws a box to pick with anywhere on the board, and
Shift-clicking picks one thing. Out around the open card this picks annotations,
and only annotations. A plain press out there still moves the board, so a press
without Shift still cannot land on the wrong level.

Cards, wires and notes out there stay out of reach until a person backs out.

A picked annotation is in hand wherever it is: it stops fading and can be moved,
resized, written on, copied or deleted. It fades again once let go.

A box can start anywhere and catches what it touches, wherever that is. Where it
starts should not matter much, because annotations sit wherever a person put them,
and that is often past the border of the room they belong to.

It picks annotations on one level at a time: the first with something in the box,
starting with the level under the start of the box, then the card open now, then
outwards. Cards and annotations cannot be picked together, so a box started in the
open card goes for its cards first, and one started out around it for annotations
first.

## Consequences

Each level's annotations keep moving as they did, with the level they are on, so
nothing is needed to carry a pick across levels.

A person who wants annotations on two levels at once has to do them one level at a
time, and a person who wants to pick cards and annotations together cannot yet.
