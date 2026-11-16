# 27. A wire is curved or square, as the person looking chooses

Date: 2026-11-15

## Status

Accepted. Adds to ADR 0016, which still holds for curved wires. ADR 0029 lets a
wire on a sketch keep a shape of its own, whatever the board draws.

## Context

ADR 0016 made every wire one smooth curve, bent only by moving its sentence.
That reads well on a busy level, but a person laying out a diagram by hand
wants to say exactly where a line runs, the way a diagram tool does: straight
pieces, right angles, a piece dragged out of the way, an arrow that meets a
card at a chosen spot on its edge.

## Decision

- **A board draws its wires curved or square.** Two buttons beside the zoom
  choose. The choice is this window's, kept for every board, like the open
  palette: it is how a person likes to look, not part of the drawing, so it
  changes nothing others see.
- **A square wire leaves and reaches a card straight out of a side**, turning
  only at right angles, and finds its own way until a person moves a piece.
- **Picking a square wire shows a handle on each piece.** Dragging one slides
  that piece square to the way it runs, on the grid, and the pieces either
  side stretch to follow. Dragging the piece that leaves or reaches a card
  keeps a short stub at the card and adds two bends, so the wire still meets
  the card where it did. Double-clicking the line splits a piece in two, so
  either half can be moved. Double-clicking a piece's handle takes it out, and
  the turn at each end of it, where the wire still runs true: the piece beside
  it slides into line, and an end slides along its card's side only where it
  must and stays on that side. Its menu lets it find its own way again.
- **Dragging an end onto a side** keeps where along that side it was let go,
  on the grid when the board is square, for curved wires too.
- **Bends are kept on the wire** in a sketch, in the level's own space, and a
  curved board keeps them unused. Moving one card leaves them where they were;
  moving both of its cards together moves them along, as does copying.
  Pointing an end at another card forgets them, since they were made for the
  card it left.
- **A sentence on a square wire sits on it.** Moved, it stays at the spot on
  the wire nearest where it was put; it does not bend a square wire, whose
  pieces are what a person bends.

## Consequences

Two people on one sketch can see it drawn differently. The bends one of them
makes are kept and seen by the other as soon as they draw square too.

A map's wires are drawn square too, finding their own way, but their pieces
cannot be moved yet: a map's wires cannot be picked, and an arrangement keeps
only where things sit, not where a wire turns.

A square wire meets a card that is not a box, such as a person, at its
outline: each end is drawn in along the piece it is on, so that piece still
runs straight.
