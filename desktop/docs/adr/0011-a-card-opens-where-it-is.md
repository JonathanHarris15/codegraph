# 11. A card opens where it is

Date: 2026-11-05

## Status

Accepted. Replaces tunnelling, and the last paragraph of ADR 0010. ADR 0012 changes
which levels can be drawn on, and ADR 0014 what a wire can end at.

## Context

Moving down a level used to be a scene change: the board zoomed into the card,
faded out, and zoomed back in on the level inside it, with only the level above
kept around it. A card that had just been opened was about as big as what it
held, so an empty one left nowhere to draw, and only the innermost level could
be drawn on.

## Decision

Double-clicking a card **opens** it. It grows where it is, around its own
middle, to about three quarters of what is on screen. The zoom does not change,
unless the card would not fit, when the board zooms out just enough. Nothing
fades.

The cards around it are pushed straight out from its middle until they are
clear, and what they land on is pushed on in turn. That is only where they are
drawn: where they were put stays as it was, so they return when the card closes.
A card nothing pushed stays exactly where it is, even on top of another.

Every card open is drawn, each inside the one before, all the way out, and a
card that holds an open one is big enough to hold it. Opening a card closes any
other card open on its level; there is one open chain, which is the path in the
trail.

Every level on screen can be drawn on. Pressing a card or the board works on the
level that press landed on, and it takes effect in the one press.

An open card has **room**: a rectangle in the space its insides are laid out in.
A person can drag its corners or sides to change it. Carrying something past its
edge grows it, and it stays grown. It is never smaller than what it holds.
Room is kept on the card in a sketch and in the arrangement on a map. Until a
person changes it, a card's room is not kept, so it fits the screen it is opened
on. A proposal's room lasts only as long as the proposal is open, because a
proposal's `layout` holds positions only.

Each open card is pinned to the middle of its spot on its level by a point in
its own space, settled when it opens and kept until it closes. So it can grow in
any direction without what is already inside it sliding.

Zooming only zooms. It used to tunnel in and out past a certain scale, which
would close a card when zooming out to see all of it.

A wire still joins two cards on one level. One cannot be drawn from a card inside
an open card to a card outside it.

## Consequences

The word in the glossary is now opening, not tunnelling.

A card moved while pushed stays where it was dropped, so it does not return to
where it was when the card closes. The arrow keys and the alignment bar move a
card from where it was put, so a pushed card can look as if it barely moved.

A person's moved sentence is ignored while one of the cards it joins is pushed,
since it would be left behind on the board. It comes back when the card closes.
