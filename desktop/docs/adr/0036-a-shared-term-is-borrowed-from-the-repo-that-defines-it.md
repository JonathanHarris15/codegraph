# 36. A shared term is borrowed from the repo that defines it

Date: 2026-11-24

## Status

Accepted. Builds on ADR 0035.

## Context

A wardrobe's server keeps garments and hands them out; its web app shows
them. Both say "garment", and both must mean the same by it: the same fields,
the same links to other things, the same words. That is a contract between
the two, as much as the calls the server answers are.

Under ADR 0035 each repo keeps its own terms. If both repos define Garment,
the two copies drift apart. If only the server's repo does, someone working
in the web app cannot read the term without the server's repo to hand.

A home repo for a project's shared terms would fix both, but it is one more
thing to choose when setting a project up, and a project that shares nothing
would still need one.

## Decision

**A term is defined in one repo, and any other repo that uses it borrows it.**
This holds between repos of different software systems and between repos of
one software system (ADR 0028).

### Which repo defines it

The repo that keeps the term's records: the one with its `store`. Where no
repo keeps it, the repo the others call. This says where a person or an agent
writes a shared term. Nobody chooses it at setup.

### What a borrowing repo carries

A copy, in its own `codegraph/terms/`, written by codegraph and never by hand:

```markdown
---
term: Garment
borrowed from: acme/wardrobe-api @ a1b2c3d
sum: 9f2e41
store: garments
points at:
  - term: Wardrobe
    how many: one
    says: the wardrobe it hangs in
avoid: [item, piece, clothing]
---
One piece of clothing a person owns. A pair of socks is one garment.
```

- **borrowed from** names the defining repo by its GitHub address and the
  commit the copy was taken at.
- **sum** is a fingerprint of the term as the defining repo wrote it: the
  whole file, leaving out these two lines. A copy edited by hand no longer
  matches its sum, which shows without reading the other repo; a defining
  term whose own fingerprint differs from it has moved on.
- Everything else is the defining repo's, word for word.

Borrowing is one step: a person or their agent asks for a term by name,
codegraph finds the repo on the project that defines it, and writes the copy.
Refreshing a copy is the same step.

### What the check does

In a borrowing repo:

- **A copy whose sum does not match** was edited by hand: a mismatch.
- **The code uses one of the term's avoid words**: a mismatch, as for the
  repo's own terms.
- **The term's `store` and `points at`** are the defining repo's to keep, and
  are checked there, not here.
- **Where the defining repo can be read**: a term that has changed there since
  the pinned commit makes the copy stale, a mismatch fixed by refreshing. A
  term that is gone from it is a mismatch saying so.
- **Where it cannot be read**, because a build server has no access to it or
  the computer is offline, the check says it skipped that step, and nothing
  else.

Across a project's repos:

- **Two repos that each define a term of the same name** are fine while
  neither reaches the other and they are not one software system. The same
  word can mean two things in two systems.
- **Once one reaches the other**, by a wire or a call, **or they are one
  software system**, it is a mismatch: one defines the term and the other
  borrows it.

These are checked across a project's repos at once, given each repo's map,
since no one repo's files can show them. A repo that is not handed in is left
alone: a copy borrowed from it is neither stale nor gone, as far as the check
can say.

## Considered options

- **A home repo for each project's shared terms.** One place to look, but one
  more choice at setup, and it has to exist before anything is shared.
- **Shared terms kept in the app.** Settled against in ADR 0035.
- **No copy: codegraph looks the term up when asked.** Nothing to keep in
  step, but a person without codegraph, or a build server without access to
  the defining repo, cannot read the term at all.
- **Copies kept in step by hand.** People edit copies, and copies drift.
- **A pinned copy, written by codegraph.** Chosen. It reads like any other
  term, and the check knows where it came from, at which commit, and whether
  anyone has touched it.

## Consequences

Changing a shared term changes it for every repo that borrows it, at that
repo's next refresh. The map knows which repos on a project borrow a term, so
a proposal that changes it in the defining repo can show who it will reach. A
repo on a project the member is not on stays unseen.

A term whose records move to another repo is defined there instead. Copies
that still name the old repo report the term gone until they are borrowed
again from the new one.

A repo that is out of reach cannot be borrowed from until it can be read.

Not decided here: for a term with a store, the fields themselves could come
from the defining repo's schema, so a copy carries the contract's whole shape
and the borrowing repo's code can be checked against it.
