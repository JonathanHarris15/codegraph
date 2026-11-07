# 18. A GitHub map is shared and a local map is not

Date: 2026-11-06

## Status

Accepted. Builds on ADR 0003, which says a map is read from the code at one
point.

## Context

Members want to see each other work on a map. But a map is read from code, and
two members' working copies differ: one has a feature branch and unsaved
changes, the other does not. A card on one member's map may not exist on the
other's.

We could have put everyone on one map, the main line, or saved each map online
so a member with no access to the repo could still see it.

## Decision

There are two kinds of map. A GitHub map is read from a GitHub copy, at any
branch or commit. Members on the same one see each other. A local map is read
from a member's own working copy, and no one else ever sees it.

GitHub decides who can open a map. A member who has not been let into a repo
sees that software system greyed out, and told they need adding to the repo.
Sketches are not held back in this way: every member of a project can open all
of its sketches.

A map is read on each member's own computer, through their own GitHub access. It
is not saved online.

## Consequences

Access to code is settled by GitHub, the one place that already knows, and
codegraph keeps no copy of it to protect.

Opening a GitHub map does not need a working copy, so a member who has never
cloned a repo can still look at it.

A sketch started from a snapshot of a map does go online, local maps included,
and every member of the project can see it. So a member with no access to a repo
can still see the shape of it, if someone with access makes a sketch of it. That
is deliberate.
