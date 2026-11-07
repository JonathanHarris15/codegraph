# 21. A computer keeps its own copy first

Date: 2026-11-06

## Status

Accepted.

## Context

Projects and sketches are moving online, but a member must still be able to work
with no connection, and to make a diagram that has nothing to do with any
project. The simple alternative is an online-only app that stops working when the
connection goes.

## Decision

Each computer keeps its own copy of a member's projects and sketches, and works
from it. The online copy catches up when there is a connection.

Offline, a member can open any project sketch and any sketch of their own. A loose
sketch someone else shared opens only if they made a copy of it to their own
library. Maps come from working copies; a software system with none is out of
reach.

Offline changes go up on reconnecting. Where two changes hit one thing, the last
change wins, item by item, and both stay in the history.

A loose sketch is private but follows its member's account between computers.

## Consequences

Agents read the copy on the computer, so they need no sign-in of their own, but
they only see changes as of the last time the app was open.

Being held protects a card only while everyone is online, so an offline change can
overwrite someone's work. The history is what makes that safe.
