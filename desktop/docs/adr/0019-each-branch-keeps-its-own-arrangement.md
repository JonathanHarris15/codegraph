# 19. Each branch keeps its own arrangement and notes

Date: 2026-11-06

## Status

Accepted. Replaces the parts of ADRs 0009 and 0010 where annotations and an
arrangement follow the project.

## Context

ADR 0010 kept one arrangement per project, so the same layout showed on every
branch. With members online, that would mean a card moving on one member's map
because another moved it on a different branch, with no cursor to explain it.

Keeping one layout seemed to matter because separate ones drift apart. But in
use, people shift cards out of the way all the time, and where a card sits is
not worth protecting.

## Decision

Each map keeps its own arrangement: each GitHub branch, each commit looked at, and
each local map. A new one starts from the main line's. Local ones stay on the
member's computer until the branch is pushed, when its arrangement goes with it.

When a branch is merged, the map takes the whole arrangement of whichever side
was last worked on. Arrangements are not blended card by card, which could leave
a layout no one ever drew.

Annotations are per map too, so a note on main does not show on feature-x. A new
map starts with none. Unlike a layout, people do want notes kept, so at a merge
the branch's notes are added to the map's and none are dropped. The project's top
level has one arrangement and one set of notes, for everyone.

## Consequences

Moving a card only ever changes the map being looked at, so a move is always seen
with the cursor that made it.

Two maps of one system can look quite different, and work on a layout can be
replaced at a merge. Both are accepted, because layouts are not worth keeping.

A merge is seen from git's history, so a squash merge, which leaves no link back
to its branch, keeps the main line's layout and picks up no notes.
