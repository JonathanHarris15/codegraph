# 38. The ontology map is a graph to look at and a dictionary to write in

Date: 2026-11-24

## Status

Accepted. Builds on ADRs 0035 and 0036, and on the drawing look (ADR 0033).

## Context

ADR 0035 put a project's terms and decisions in files, one to a file in each
repo's `codegraph/` folder, and the check holds the code to them. A person
still needs to see the whole of it, and to write in it without opening a
Markdown file and its YAML head by hand.

Five ways of showing it were tried side by side on the project canvas: a canvas
of cards, a layer over the code map, a dictionary, a grid, and a timeline of
decisions. Jonathan chose two, for two different jobs: the dictionary to write
in, and a graph to look at that feels alive, in the way a note-taking app's
graph of linked notes does, but in the drawing look.

## Decision

The **Ontology map** button on a project's map bar opens one view of the
project's terms and decisions, read from every repo of the project that has a
working copy on this computer. It has two faces, and each opens the other where
the person is.

- **The ontology graph** is the one to look at. Each term is a dot, a word with
  no store a ring, a borrowed copy a dashed ring, a decision a square. Wires
  pull what is linked together and everything else apart; it drifts when left
  alone, dots run along each wire the way it points, and what the check finds
  pulses. Each software system sits in a light bubble with its name on a tab.
  Hovering lights a node's neighbours; dragging pulls it; Shift-dragging from
  one term to another wires them; double-clicking opens the node in the
  dictionary.
- **The dictionary** is the one to write in: an index with a block for each
  software system, and one entry at a time as a sheet on the drafting paper,
  every part of it a field. A term's links are a table, with how many as
  segments. A decision is laid out on the ADR template, its rules as sentences
  with blanks, drafted until both blanks are filled. Each entry ends with its
  file and its diff.

**Edits are files.** Each change is written to the entry's file in the repo's
working copy shortly after the person stops typing, never on the main line: the
first edit moves the working copy onto a branch, `ontology`, or the next free
name, as a token change does (ADR 0024). The view shows what is not committed as
a diff, a repo at a time, and commits the `codegraph/` folder alone, on that
branch. Pushing is the person's.

A borrowed copy is read-only here: it is changed in the repo that defines it,
then borrowed again (ADR 0036). A repo with no working copy on this computer is
listed, and cannot be written.

## Considered options

- **A canvas of cards.** Familiar, but a second canvas beside the map, laid out
  by hand, doing what the map already does.
- **A layer over the code map.** Shows a decision where the code breaks it, but
  a word with no store, or a decision with no rules, has nowhere to sit.
- **A grid, or a timeline of decisions.** Quick for bulk changes, or good at how
  decisions changed; neither is a place to write a definition or to look at the
  whole.
- **A graph and a dictionary.** Chosen. The graph is for seeing and playing; the
  dictionary is for writing; each is better at its job for not doing the other's.

## Consequences

The ontology graph is the one thing in the app called a graph. The canvas and
the map still avoid the word.

The view writes only the `codegraph/` folder of a working copy, and commits only
that folder. Nothing it does reaches GitHub until the person pushes.

An edit written as the person types is saved even if the window closes, but a
half-filled rule is not: it only becomes a rule when both its blanks say
something, since a rule with a blank cannot be checked.
