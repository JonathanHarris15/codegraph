# 10. An arrangement is kept beside the map

Date: 2026-11-04

## Status

Accepted. How a card opens has since changed; see ADR 0011. What moving a card
does to a moved sentence has since changed; see ADR 0016. An arrangement now
belongs to a branch, not the project; see ADR 0019.

## Context

The canvas lays a level out itself: cards in columns by what they are, wires
curved between them, each wire's sentence slid along its own curve to the
nearest clear spot. On a crowded level that is not good enough. Cards sit on
top of each other, and two sentences that cannot both be clear end up one
over the other. Only the person reading it knows which card they want where.

Nothing in the code says where anything sits, and nothing ever should: a
repo's tags say what the software is, not how to draw it. So a person's
moves have to be kept somewhere else, or thrown away.

Letting a card be dragged also takes the single click, which until now
tunnelled into the card. A gesture cannot both pick a card up and leave the
level.

## Decision

Where a person has moved a map's cards and its wires' sentences is an
**arrangement**, kept by the app, one file per project, never in any repo.
It is keyed by the card's id, and by the two cards a wire joins and how, so
it survives the code being read again.

Moving one card pins every card on that level where it already was, so the
rest never shuffle. A sentence is pinned only when it is dragged; the others
go on being laid out, and keep clear of the pinned ones.

A sketch keeps its own, inside the sketch, as it already did. So does a
proposal, in the `layout` it already kept for its cards, keyed for a
sentence by the names the wire reads as.

Tunnelling into a card is now a double-click. A single click picks the card
up. On a sketch, a double-click on the card's name writes on it, as before.

Hovering a card and pressing `f` fills the screen with it, without going
into it.

## Consequences

The code stays the only source of the architecture. An arrangement says
nothing a tag could say, and the check never looks at it.

An arrangement follows the project, not a branch: the same layout shows
whichever branch the map is read from. A card a branch does not have keeps
its spot, ready for when the branch does.

Renaming a component changes its id, so it loses its spot and is laid out
again. That is honest: it is a different card as far as the map can tell.

Arrangements are not shared through git, so a teammate on another computer
sees the map laid out afresh until projects are shared online (plan, Later).

Because a card can be dragged, a level inside an open card is anchored when
it is arrived at rather than worked out again from what is inside it. Were
it worked out again, dragging one card would slide every other card the
other way, as the open card grew and its contents re-centred. The open
card's border is now drawn round whatever is inside it instead.
