# 31. A wire's sentence shows when its card is in focus

Date: 2026-11-17

## Status

Accepted. Changes when the sentences of ADR 0016 are drawn; where they sit is
the same.

## Context

Every wire's sentence was drawn all the time. On a busy level the sentences
were most of what a person saw, and the cards were lost among them. Hovering a
card already lit its wires and stepped the rest back, but the moment a person
clicked the card to look closer, the light went out. And on the map a wire
could not be clicked at all.

## Decision

- **A still level shows no sentences.** A wire's sentence is drawn only while
  its wire is in focus.
- **Focus is what is under the pointer, or what is picked.** Hovering a card
  focuses it. Picking a card or a wire holds the focus there until it is let
  go, and while it is held, hovering something else does not move it.
- **In focus, a card's wires draw themselves in.** Each lit wire runs from its
  start to its arrow, and its sentence comes up a moment after. The rest of
  the level steps back, as before.
- **A wire can be clicked**, on a sketch and on the map, anywhere along its
  line. That picks it and shows its sentence; on a sketch, its bar opens and
  a double-click edits what it says.
- **A sentence keeps its place while hidden.** It is laid out and measured as
  before, so nothing jumps when it shows.

## Consequences

A wire whose code gave it no words no longer shows that from far off; it shows
once its card is in focus. Tidying a level leaves wider gaps between cards and
ranks than before, since the gaps no longer hold a sentence all the time.
