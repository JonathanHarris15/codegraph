# 1. Setup is the repo's, not the branch's

Date: 2026-11-02

## Status

Accepted.

## Context

The app first read a codebase by looking at the files in the folder — that
is, at whatever branch happened to be checked out. That made "is this set up
for codegraph?" an answer about a branch.

It is not. Turning codegraph on in a repo writes three things that everyone
who opens the repo should get: the plugin in its committed
`.claude/settings.json`, the rules in its `CLAUDE.md`, and a tag on every
file. A person sitting on a feature branch cut before any of that would have
been told their repo needs setting up, which is false and would send them to
do it twice.

The setup skill does its work on a branch and the person merges it, so there
is a real in-between state worth naming rather than rounding off.

## Decision

Repo-level questions are read against the repo's **main line** — what
`origin/HEAD` points at, else `origin/main`, `origin/master`, `main`,
`master`, in that order. Setup is one of those questions.

Working-copy questions stay with the checkout: which branch you are on, what
is uncommitted, and how far ahead of or behind its upstream it is. Being
behind the cloud is a fact about the branch in front of you, not about the
repo, and flattening it to the main line would hide the thing a person
actually wants to know.

Between the two there is a third answer, **set up on this branch only**: the
branch here has all three parts and the main line does not. That is a merge
away from done, and the card says so.

Reading at a ref also means only what git tracks is counted, so `node_modules`
and other loose files never swell the file count.

## Consequences

Reading one codebase costs a handful of git commands rather than a directory
walk. Where the checkout is standing on the main line, one read answers both
questions and the app does not ask twice.

A setup that has been run but not committed counts for nothing. That is
deliberate: until it is committed, nobody else opening the repo gets it.

A repo with no commits has no main line, so it reads as not set up.
