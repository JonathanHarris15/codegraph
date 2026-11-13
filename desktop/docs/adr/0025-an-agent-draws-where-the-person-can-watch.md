# 25. An agent draws where the person can watch

Date: 2026-11-13

## Status

Accepted.

## Context

An agent could already draw a whole sketch at once, as a Mermaid flowchart.
That suits a first draft, but not working together: the person cannot see what
the agent is doing until it is done, the agent cannot add a note, a frame or a
store's fields, and when the person says "this card" the agent does not know
which sketch, let alone which card, they mean.

The agent runs in the MCP, a program of its own; the app is another. Neither
calls the other.

## Decision

- An agent draws **step by step** with `edit`: each step is one thing a person
  could do with the mouse, done to the sketch on disk, read fresh each time so a
  person's work in between stays. Every step is tried on a copy first, so a
  wrong one draws nothing.
- Each step moves the **agent's cursor**, a small file in the app's folder. The
  app watches that folder and the sketches beside it, redraws what changed, and
  draws the cursor at whatever the step touched, by id, so the agent never needs
  to know where the canvas put a card. While the person has the sketch open,
  the MCP waits a moment at each step so the cursor can be seen to get there.
- The window writes what the person is **looking at** to the same folder, and
  the agent reads it with `looking`. It is only ever on this computer.
- A frame an agent draws round some cards names them, and the canvas fits it to
  them the first time it shows them; from then on it is an ordinary frame.

## Consequences

- Nothing goes through the online side, so the cursor and "looking at" are seen
  only by the person whose agent it is. What the agent draws still goes online
  as any sketch does.
- A sketch the person is not looking at is drawn at once, with no waiting.
- The list of annotation kinds is kept in the annotations module for the agent,
  and in the canvas's library for drawing; a test holds the two together.
