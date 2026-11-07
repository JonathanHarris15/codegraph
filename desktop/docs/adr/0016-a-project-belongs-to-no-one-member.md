# 16. A project belongs to no one member

Date: 2026-11-06

## Status

Accepted. Answers where projects live online, left open in the plan and in
ADR 0006.

## Context

Projects have lived in a file on one computer. They are moving online so that
several members can work on one at once. The usual shape for that is to keep
each project under the person who made it, which is simple to secure and to
list. But then sharing is an exception bolted on, and handing a project over
means moving it and everything under it.

## Decision

Projects stand on their own, beside members rather than under them. A project
says who its owner is and who else is on it, and in what role. Listing "my
projects" means asking which projects name me.

## Consequences

Sharing a project, or handing it to someone else, changes who it names and
moves nothing.

Who may do what has to be read from the project itself on every request, so
the access rules carry more weight than they would with one owner per folder.

A project's name and short name can no longer be assumed unique to one
person. What that means for a repo naming a project (ADR 0006) has to be
settled.
