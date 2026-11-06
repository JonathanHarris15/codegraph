# 14. A wire meets an open card at a hub

Date: 2026-11-06

## Status

Accepted. Changes the last paragraph of ADR 0011, that a wire joins two cards on
one level, by giving a level one more thing a wire can end at.

## Context

A sketch is drawn from the outside in. A person wires two containers first, then
opens one, and the wire just stops at its border. There was no way to say which
parts inside it the wire really reaches.

## Decision

Where a wire meets an open card's border there is a **hub**. Parts inside the card
can be wired to it, any number of them, which says what the wire from outside
really reaches. The hub belongs to the wire: it runs the way the wire does, its
wires take the wire's kind to begin with, and it goes when the wire goes or lets go
of the card.

A wire inside the card names the hub as one of its ends, as `hub:` and the outer
wire's id. A wire cannot be drawn straight from a card inside to a card outside; it
goes by the hub, so the wire at the higher level stays true on its own.

This is only on a drawing. A map read from code already knows which part a wire
reaches, and shows that through its port on the border.

## Consequences

An agent reading a sketch sees a wire to a hub as a wire to the card at the far end
of the outer wire, and a proposal makes it one, so the hub is a way of drawing and
nothing an agent has to learn.
