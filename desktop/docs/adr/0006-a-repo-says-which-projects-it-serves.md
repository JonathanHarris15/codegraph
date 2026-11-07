# 6. A repo says which projects it serves

Date: 2026-11-02

## Status

Accepted. Now that projects are online, a repo's claim only suggests: it is
matched only among the projects a member is on, and never adds a repo to a
project or a member to one. Where nothing matches, the app says to ask the
owner for an invite or to make a new project.

## Context

A software system can serve more than one project: a login service used by
both Harris Appraisals and Mosaic. Something has to record that it belongs to
each. It could live with the project, in the app, or with the repo, in its
own code.

Kept only with the project, the repo never changes when a project takes it
up. But until projects are shared online, a teammate who clones the repo, or
signs in with GitHub on a new machine, has no way to learn which projects it
belongs to.

## Decision

A set-up repo names every project it serves in its own codegraph config,
committed with the code. Signing in with GitHub finds a project's repos by
reading that config.

The project itself (its name, its sketches, its shallow software systems)
lives in the app for now, and online later. It is not written into any repo.

## Consequences

A project taking up a repo it did not make means a one-line change in that
repo, made and merged like any other.

Two places now know about a project: the app holds the project, and each repo
holds its own claim to it. A repo can name a project the app has never heard
of; the app offers to make it rather than ignoring it.
