# 34. Wires into one card join

Date: 2026-11-24

## Status

Accepted. Changes where a wire meets the card it reaches. Where a wire
leaves its card, and how it finds its way, are as before.

## Context

Every end of every wire had a place of its own on its card's side, so two
wires between the same two cards never drew as one. A card many others use,
such as a shared contract, then had a dozen parallel lines and a dozen
arrowheads stacked down one edge, and the rest of the level was hard to
read past them. Diagram tools meet this the same way: Graphviz, yEd and
ELK can merge the lines that reach one thing into one before it.

## Decision

- **Wires arriving on one side of a card meet it at one place**, where the
  middle of what they come from is, and go in as one line to one arrow.
- **A wire leaving a side still has a place of its own**, apart from the
  arrivals, so a wire there and a wire back never draw as one.
- **On a card that is open, each arriving wire keeps a place of its own**,
  since each has a hub there that wires inside reach.
- **Square wires show a dot where each one first meets the others' line**,
  as a drawing marks lines that join. Curved wires meet at the card and need
  none.
- **Focus still shows one wire at a time.** Hovering a card lights its own
  wires all the way in, and picks out their sentences.

## Consequences

Close to the card, wires that have joined are one line; to pick one, click
it further out, before it joins. Wires leaving one card to many still fan
out apart; if that proves as busy, the same can be done for them.
