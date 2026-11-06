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

Two kinds stay what they are, because they do more than look a certain way. A
**database** will gain the means to define and read data structures, so it is
never a look, and its icon is not offered to card types. A **page** holds a
mockup.

A person on the context level is drawn as the little person icon.

## Consequences

A map read from code keeps its kinds, since the code says what they are. A proposal
drawn over a map keeps them too: what it draws gets built, so a card has to be a
kind the code can have.

Making a proposal from a sketch has to turn a person's own type into something the
code can have. It becomes a module, the kind that promises least about how it is
reached, and its type goes in what it is for, so the agent can still see it. The
glossary's four kinds of component still describe what is built; a card type only
describes what is drawn.
