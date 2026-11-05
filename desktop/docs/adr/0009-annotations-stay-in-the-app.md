# 9. Annotations stay in the app

Date: 2026-11-04

## Status

Accepted.

## Context

People want to write on the map and on sketches: a sticky note asking a
question, a frame round the part being worked on, an arrow to the card that
worries them. These annotations are read by people and by agents, but they
are not the architecture and must never be mistaken for it.

A sketch is already kept by the app, so its annotations go inside it. A map
is read from the code, so its annotations could be kept in the app beside the
project, or committed in each repo beside its codegraph config.

## Decision

A map's annotations are kept by the app, one file per project, never in any
repo. A sketch keeps its own. Either way they are in layers that can be
shown, hidden, and told whether to line up with the diagram's cards.

An annotation names the level it is drawn on and, when it keeps beside a card
or a line ends on one, that card, by the same id the map gives it. When the
card is gone, the annotation stays where it was last drawn.

The MCP gives an agent the annotations with the map and with a sketch, under
a line saying they are not the architecture.

## Consequences

The code stays the only source of the architecture: nothing an annotation
says can be read back as a tag, a container or a wire, and the check never
looks at them.

Annotations are not shared through git. They are shared when projects are
shared online, which is still to come (plan, Later). Until then a teammate on
another computer does not see them.

They follow the project, not a branch: the same notes show whichever branch
the map is read from. A card a branch does not have leaves its annotations
where they were drawn.
