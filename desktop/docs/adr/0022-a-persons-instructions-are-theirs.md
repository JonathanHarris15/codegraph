# 22. A person's instructions are theirs, and every edit is kept

Date: 2026-11-07

## Status

Accepted. Builds on ADR 0004, which made the instructions module the one place
everything codegraph tells an agent lives.

## Context

Codegraph ships the words it tells agents: how to set a repo up, the tag rules,
how to make and build a proposal, and the block a set-up repo carries in its own
context file. They are markdown files inside the app.

Teams do not all work the same way. One has house rules about where tests go,
another wants the setup sweep to leave a folder alone, another simply wants the
tone changed. Someone who installed the app cannot edit a file inside it, and
nobody should have to fork codegraph to tell their own agents something.

What makes this different from a setting is what hangs on it. These words are
what an agent does. A change that reads better can make the agent worse, and the
person will not find out until the next repo it touches. So the words a person
had before matter as much as the words they have now.

## Decision

The settings page shows every topic. A person may write their own words for any
of them, and from then on every agent that asks is told theirs.

Each save is an **edit**, kept in one file in the folder where the app keeps its
things, oldest first, with the time it was made. The newest edit is what agents
are told; a topic with no edits is told the words codegraph ships with, its
**default**. Nothing is ever taken out of the history, and the same words saved
twice add nothing to it.

Putting the default back is an edit of its own, holding the default's words. So
it is one rule throughout -- the newest edit is in force -- and what the person
wrote is still there to read and to put back. Putting an old edit back in force
writes it again as a new edit rather than winding the history back.

The app and the MCP read the same file. The MCP is a second process, started by
the person's agent, so it is handed the same folder at startup and reads the
edits on each call. Nothing is copied into any repo: a person's instructions
live with the app, like their card types, because they are how that person
works, not a fact about any codebase.

## Consequences

An agent is told whatever the person last wrote, with no restart and no sync.

The history only grows. These are pages of prose edited rarely, so a file that
keeps all of them stays small.

A person who edits `working-here` changes the block that goes into repos set up
from then on. Repos already set up carry the block they were given; changing
them is an ordinary edit to their context file, not something codegraph goes
back and does.

Where codegraph changes the words it ships with, a person who has written their
own keeps theirs: their edit is newer. The topic is marked as theirs in the
settings page, and the default stays one click away, so the difference is
findable rather than silent.

A topic codegraph stops shipping leaves its edits in the file, unread and
harmless. Nothing is deleted on a person's behalf.

## Considered options

- **Let people edit the markdown in the app.** Nothing to build, but only
  someone with the source can do it, and an update overwrites it.
- **One text per topic, no history.** Simpler, and wrong for this: the whole
  point is being able to go back when a change makes the agent worse.
- **Keep the history in git.** The app's folder is not a repo, and asking a
  person to read a diff to recover a paragraph is not the app doing its job.
- **Keep the last few edits.** Saves a few kilobytes of prose by throwing away
  the one thing here that nobody else can write again.
