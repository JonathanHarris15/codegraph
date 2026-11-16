# 29. A wire on a sketch can keep its own shape

Date: 2026-11-16

## Status

Accepted. Adds to ADR 0027: the board's choice is now what a wire is drawn as
until a person gives it a shape of its own.

## Context

ADR 0027 let a board draw every wire curved or square, as the person looking
likes, from the layers panel and the board's menu. People drawing by hand
reached for the wire itself to change it, found nothing on its bar, and did not
find the board-wide choice. A diagram often wants both: a few wires routed by
hand at right angles, and the rest left to curve.

## Decision

- **A wire on a sketch may say its shape**, curved or square, and is then
  drawn that way for everyone. A wire that says none is drawn as the board
  draws wires, as before.
- **A picked wire's bar shows both shapes**, the one it has pressed in, and
  its right-click menu has the other. Tab switches the picked wire.
- **Tab while drawing a wire switches the shape in hand**, and the hint says
  which it is. A wire drawn in a shape other than the board's keeps that shape;
  the next wire starts in the same shape, until the board's choice changes.
- **Bends stay with the wire** whichever shape it has, as ADR 0027 says, so a
  wire switched back to square runs where it was put.

## Consequences

The board's choice still changes how every wire without a shape is drawn, so
two people can still see those wires differently. Wires with a shape of their
own look the same to everyone.

A map's wires have no shape of their own: they cannot be picked yet.
