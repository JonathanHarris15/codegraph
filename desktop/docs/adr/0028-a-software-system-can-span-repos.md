# 28. A software system can span repos

Date: 2026-11-16

## Status

Accepted. Changes what a software system is: it was one repo, seen whole.

## Context

C4 has no repos in it. A software system is one thing people use and one
team owns; its containers are the parts that run on their own. How the code
is split across repos is a separate choice: one repo for the whole system,
or one repo for each container, are both C4.

Codegraph made each repo a software system. That fits a repo that ships a
website, some cloud functions and a command-line tool together (ADR 0002),
but not a team that keeps its phone app, its desktop app and its server in
three repos. Those were drawn as three software systems beside the outside
ones a project calls, where C4 draws one software system holding three
containers. The container level of each held a single card and was passed
straight through, and the card library offered "mobile app" inside a repo
that was itself the mobile app.

## Decision

A software system is one or more repos. A repo says which software system
it belongs to in its own config, beside the projects it serves:

```json
{
  "projects": ["billing"],
  "system": "Billing",
  "containers": { "api": { "kind": "server", "folders": ["src"] } }
}
```

Repos on a project that name the same system, ignoring case, are drawn as
one software system card, named as the config says, holding every one of
their containers side by side. A repo that names no system, or is the only
one to name it, is a software system of its own, as before.

Everything git does stays a repo's own: setup, branches, the branch a
member is looking at, and proposals (ADRs 0001, 0007). Inside a software
system of several repos each container shows which repo it is in and the
branch that repo is on. A sketch that changes such a system is handed over
as one proposal for each repo it changes.

A wire one repo's code writes to another repo in the same system, `wire to
billing-api: ...`, joins the containers rather than the systems. Where the
repo it reaches has more than one container, `to billing-api/api:` says
which; without it, the wire goes to that repo's first container.

## Considered options

- **One repo, one system** (what codegraph did). Simple, and every git
  thing has one home, but it is not C4 for a team with a repo per
  container, and it hides the container level from them.
- **The project holds the grouping, in the app.** Nothing in any repo
  changes, but a teammate who opens one repo cannot tell which system it is
  part of, which ADR 0006 settled the other way for projects.
- **The repo names its system, in its config.** Chosen. It is one line,
  committed with the code, and a repo that says nothing keeps today's map.

## Consequences

A repo that cannot be opened, because GitHub has not let a member in or they
are offline, cannot be read, so it is drawn as a system of its own until it
can be.

Linking a repo to a shallow software system still makes the repo that
system. A further repo joins it by naming the system in its config.

The ids of a system's containers keep their repo in them, so where people
put cards, their notes, and the branch each card is read at still belong
to one repo's map (ADRs 0010, 0019). The card for a system of several repos
is a project-level thing, kept with the project.
