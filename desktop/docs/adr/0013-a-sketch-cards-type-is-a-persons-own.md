# 13. A sketch card's type is a person's own

Date: 2026-11-06

## Status

Accepted.

## Context

A sketch offered a fixed list of kinds inside a software system: web app, server,
module, feature and so on. People drawing an idea think in their own terms, and
the list got in the way. The three kinds on the context level (software system,
shallow software system, person) still fit.

## Decision

Inside a software system, a card on a sketch has a **card type**: a name, which is
not the card's own name, with an icon, a shape and a colour the person picks. They
can save one to the card library and use it again. Saved types are kept in one
file for the whole app, and a card carries its own copy of its look, so forgetting
a type changes no drawing.

The kinds the code can name, such as web app, server, feature and module, are
**templates**: the same card with a ready-made icon, shape and colour, offered in
the card library beside a person's own types and changed the same way. A card with
no look of its own is drawn as its template, so older sketches and maps read from
code look the same.

Two kinds stay what they are, because they do more than look a certain way. A
**database** will gain the means to define and read data structures, so it is
never a look, and its icon is not offered to card types. A **page** holds a
mockup.

A person on the context level is drawn as the little person icon.

## Consequences

A card type is what gets tagged. A container's type goes in the config, which takes
any words. A component's goes in its tag after `as`: `module jobs as queue`. The map
reads it back and shows a queue, in the look saved for that type; making a proposal
saves the look if it is not saved yet.

A component still has one of the four kinds, because the check's rules hang on them:
what may reach what, who may touch a store. So a type never replaces the kind; it
says what the team calls the thing. Considered: letting `queue jobs` be a tag of its
own. It reads better, but the reader could not tell a new type from a typo, and the
check would have no rules to hold a queue to.

A drawing does not say which rules a card keeps to, so a proposal starts a type as
a module, the kind that promises least, and the agent building it settles it.

The agent may know better than the drawing. It says so, and the person decides;
what they agree goes in the proposal. The check holds the code to the proposal, type
included, so nothing is quietly tagged as something else.

A card from a template keeps its kind, so an agent building a sketch's feature
builds a feature. A proposal drawn over a map offers the same cards as a sketch.
