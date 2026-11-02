# What setting a repo up for codegraph means

A draft, written 2026-11-02, to be argued with. Companion to
`../../legacy/docs/where-codegraph-is-going.md` and
`../../legacy/docs/codegraph-for-any-agent.md`, which this is built on.
Nothing here is decided until it lands as an ADR.

## Why the old answer is dead

Today the app calls a repo set up when three things are true: its committed
`.claude/settings.json` names codegraph, its `CLAUDE.md` carries the rules,
and its files carry tags.

The first of those is not about the repo at all. It is a line in one
editor's settings file saying which plugin to load. It says nothing about
whether the code is under codegraph's rules, and an agent that is not Claude
reads it and learns nothing. `codegraph-for-any-agent.md` already makes the
call: the interface is MCP and a command line, not a plugin per host. The
moment that lands, a `.claude/` folder is how *a person* gets codegraph on
their machine — not how a *repo* is set up.

So the honest reading today is the one you gave: no repo is set up, because
the thing to be set up for does not exist yet.

## What it should mean

Four parts. Each is a property of the repo, committed, true for everyone who
clones it, and readable by anything.

**1. The repo says what it ships.** One repo is not always one program — the
gap `where-codegraph-is-going.md` calls the missing top level, and the one
C4 calls the container. A browser app, cloud functions and a script toolkit
in one repo are three boxes, and nothing in the code reliably says so.

I would declare a program the way everything else is declared: a tag on its
entry file, `codegraph: program <name> as <kind>` — `as browser app`,
`as server`, `as command`. No new file format, no second list to keep in
step, and ADR 0002 stays true: the code is the declaration. A repo with no
program tag is one program, which is what almost every repo is.

What is *above* the repo — the product a person uses, made of several
programs across several repos — cannot be declared inside any one of them.
That belongs to the thing holding them together, which is this app. More on
that under Projects, below.

**2. The rules travel with the repo.** `AGENTS.md` carries codegraph's
block, so any agent reads it; `CLAUDE.md` carries it too where that is the
convention, and both point at one text rather than keeping two copies that
drift. This is the part the old setup got right, aimed at one agent.

**3. Every file carries a tag.** Unchanged, and still the heart of it. A
file with no tag is a mismatch.

**4. The check runs without anyone remembering.** Today the check runs
because an agent was told to run it, in a `CLAUDE.md` an agent may skip. A
repo is not really held to its rules until `codegraph check` runs where
nobody can forget it: in CI, and in a pre-commit hook.

And one thing that stops being part of it: **nothing in `.claude/`.** That
is how you turn codegraph on for yourself, once, on a machine. It is not a
property of a repo and the app should stop reading it.

## Where I would push back on myself

**"Set up" is four things, so a yes/no badge will usually be wrong.** Most
real repos will have the tags and the rules and not the hook, or the hook
and half the tags. A card that says "needs setup" to a repo with 200 tagged
files is not telling the truth. The app should show the parts — four ticks,
or "3 of 4" with the missing one named — and keep one word for all four.

**Part 4 cannot be fully a property of the repo, and I should not pretend
otherwise.** Git hooks are not committed. You can commit a hooks folder and
point `core.hooksPath` at it, but that is a setting in each person's clone,
so a fresh clone is a hook short until someone runs something. CI is
genuinely committed and genuinely shared. If that bothers you, the honest
split is: CI is part of setup, the hook is a convenience the setup command
offers.

**The program tag is the part I am least sure of.** It reads well for a
server with one entry file. It reads badly for a repo where the browser app
is a folder and the worker is a folder, and neither has one obvious front
door. The alternative is a small file at the root listing the programs and
their folders — which is a second list to keep in step, which is exactly
what ADR 0002 threw out. I have picked the tag; I think the folder case
argues for allowing the tag on a folder's index file and treating everything
under it as that program, but I have not thought that through.

## What this means for Projects in this app

`codegraph-for-any-agent.md` wants a word above the repo — **Product**: one
thing people use, made of one or more programs, in one or more repos — and
says the list of repos a person happens to have open is not a domain word
but tooling, a workspace.

This app has one word, **Project**, doing both jobs. I think that is the
right place to settle it: a Project *is* the Product. It is named, it holds
the codebases that make one thing people use, and it is the only home a
product can have, because no single repo can own it. If you want a separate
"things I happen to have open" list later, that is a filter over projects,
not a second idea.

That decision is not made here. It wants an ADR, and it changes
`CONTEXT.md`, which currently describes a Project as "a piece of work" —
near enough that the drift would be easy to miss.

## What is not built

Nothing in the app has changed on the strength of this. It still reads
`.claude/settings.json`, `CLAUDE.md` and tags, and it still says one word.
Changing that is a day's work and the wrong order: the definition first,
then the reading, then the repo.

`indie-stack`, beside this repo, is the one project the app points at. It
carries the old codegraph's block in its `CLAUDE.md` and the old tags on its
files, both untouched, which is a fair picture of where everything stands:
it looks set up and it is not.

## What I need from you

1. **Is a Project a Product?** If yes, `CONTEXT.md` changes and the app
   grows a sense of what a product is for. If no, I need the word that goes
   above the repo and what holds it.
2. **Program: a tag, or a file at the root?** Everything about the container
   level hangs off this.
3. **Is the check in CI part of being set up, or a separate thing a repo can
   be?** This decides whether the app shows three ticks or four.
4. **What else is fundamentally changing?** This draft assumes the change is
   the one your two documents describe — any agent instead of Claude, and
   levels above the repo. If something bigger is moving, the four parts
   above are the wrong four.
