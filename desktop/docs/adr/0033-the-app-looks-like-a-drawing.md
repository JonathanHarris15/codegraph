# 33. The app looks like a drawing

Date: 2026-11-23

## Status

Accepted. Changes how the design system draws things, not what any of them
are.

## Context

The cards looked like any web app's: rounded white boxes with a soft shadow
and a band of their kind's colour along the top. Five card designs were
tried on one board, then five mixes of the two Jonathan liked best: one
that read like a schematic, with marks at its corners, and one that laid
out what a card holds in tidy tiles and tables. The mix he picked, framed
tiles, has the schematic's frame and the ledger's insides.

## Decision

- **The board is drafting paper.** A fine grid line every square and a
  stronger one every fifth, in place of dots. Every other page sits on the
  same paper, fainter.
- **Things are square-cornered and flat.** Corners are 2 to 4px. Only what
  floats over the page casts a shadow. A store keeps a round edge, so it is
  still the one card of another shape.
- **A card's kind is in its corner marks**, an angle top left and one bottom
  right, just off its edge, in its kind's colour. They grow under the
  pointer and take the accent when the card is picked. Every card and small
  window in the app has them, in the edge's colour. A store has none: its
  round edge is its mark.
- **Labels are set like a drawing's**: a card's type, a badge, a field's
  label and a list's heading are in the code face, in capitals. Names and
  sentences stay in the plain face, to be read.
- **What is inside a card is tiles, two to a row**, six at most, or five
  and a tile saying how many more. A store's fields are a table with every
  other row shaded.
- **Where a wire meets a card it can be drawn from, or crosses an open
  card's edge, is a small square**, like a port on a drawing.
- **The agent at work sweeps a band of light down its card**, and the card's
  edge and marks take the accent.

## Consequences

`map-layout.ts` reckons a card's height from rows of tiles and rows of the
fields table, so it changes with the CSS whenever either does.

A card's kind colour no longer runs along its top, so nothing should rely on
that band to say what a card is.
