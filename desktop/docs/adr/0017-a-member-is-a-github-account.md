# 17. A member is a GitHub account

Date: 2026-11-06

## Status

Accepted. Replaces the pasted GitHub token.

## Context

Members need a name beside their cursor and their work, and a way to sign in
and out. The app also needs to reach GitHub for each member, to find repos and
compare working copies with GitHub copies. Today it does the second with a
token a person pastes in. A separate codegraph sign-in would mean two things to
sign in to, and a profile for the app to keep.

## Decision

Signing in with GitHub is the only way in, and the same sign-in gives the app
its reach into GitHub. A member's name and picture come from GitHub. A member
is known by GitHub's number for the account, not the username, which can change.

## Consequences

No password or profile for the app to keep, and no token to paste.

Anyone on a project needs a GitHub account, including a viewer who never
touches code.
