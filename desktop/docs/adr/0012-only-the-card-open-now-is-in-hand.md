# 12. Only the card open now is in hand

Date: 2026-11-06

## Status

Accepted. Replaces the paragraph of ADR 0011 that says every level on screen can
be drawn on.

## Context

ADR 0011 let a press on any level on screen work on that level. With several
cards open, it was too easy to pick up or draw on the wrong level, and nothing on
screen said which level a press would land on.

## Decision

Only the innermost open card is in hand. Everything outside it stays in view, but
fades and cannot be picked, moved, wired, written on or opened until a person
backs out to that level. Each level further out fades further, cards, wires,
sentences, notes and annotations alike.

The board still pans from a press out there, and the back button on any open
card's lip still works, since backing out is the way to reach those levels.

## Consequences

An open card can no longer be renamed or moved from its lip: its name and place
belong to the level around it, so a person backs out first.

Something drawn is always on the level a person can see they are in, so a level
no longer needs to become the one in hand partway through a press.
