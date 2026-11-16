# 30. An agent can tidy a level

Date: 2026-11-16

## Status

Accepted. Builds on ADRs 0027 and 0029: a tidied wire is a square wire with
bends of its own.

## Context

Agents drawing a sketch step by step placed every card by hand. The result was
cards on top of cards, curved wires through cards and over each other, and
frames stretched round half a level. People clean diagrams like that in a tool
like draw.io with one click that lays the drawing out and routes its lines at
right angles. Agents had no such step, and no way to give a wire a shape,
sides or bends at all.

## Decision

- **`tidy` is a step an agent can take on a level.** It lays the level out as
  a layered diagram: each card a rank after what reaches it, the fewest wires
  turned round to break loops, each rank ordered so wires cross as little as
  they can, and the cards placed level with what they are wired to.
- **Every wire is routed at right angles.** It leaves one rank's card by the
  side facing the next rank and reaches its card by the side facing back, its
  ends spread along those sides in the order of where they go. Each piece that
  crosses over in a gap between ranks gets a track of its own, so no two lie
  on top of each other, and a wire across several ranks passes through them
  where no card is. The route is kept as the wire's shape, sides, `along` and
  bends, so the canvas draws it with what it already has, and a person can
  move its pieces after.
- **It reads down unless asked to read right.** Cards are wider than they are
  tall, so wires leaving their long sides have more room.
- **Frames, notes and loose cards keep their sense.** The cards a frame goes
  round sit side by side in one rank, so the frame holds nothing else. Notes
  keep beside the card they were nearest. Cards with no wires go in rows after
  the rest. An open card's room grows or shrinks to what it holds.
- **The layout is written here, not taken from a library.** The app does not
  pull in a layout engine for one step; this one is small, needs nothing new
  installed, and is tested at the cards' real sizes against the canvas's
  own router.
- **An agent can change a wire**, as a person can on its bar: its shape, the
  sides it meets, and where it turns.

## Consequences

The step knows only roughly how big the canvas draws a card. A route stays
square however far off it is, because the canvas joins a wire's ends to its
bends at right angles; at worst a wire takes a short jog by its card.

Tidying replaces where a person put the level's cards and how its wires ran.

People cannot tidy a level from the app yet; the step is the agent's.
