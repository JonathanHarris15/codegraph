# codegraph

A map of a codebase drawn at the level people think in (systems, features,
modules, stores, pages), not files. People declare the shape they intend; codegraph
reads the code and says where the two disagree. The same map is how a person
tells an agent what to build.

## Features

**System**:
A named collection of features a person would group together, such as the
calendar system.
_Rule_: each feature belongs to exactly one system.
_Avoid_: area, category, subsystem, domain

**Feature**:
One whole piece of work the application does when something asks for it: a
person, a schedule or an event. Planning an order of service and sending the
week's reminders are features. It is declared with the modules it uses, and in
code it is thin: it takes the request, calls those modules, and hands back the
result.
_Rule_: a feature has at least one trigger; its code reaches only the modules
declared for it, and only through their front doors; it lives in one place in
the code however many triggers start it; real work belongs in a module, not
in the feature.
_Avoid_: use case, capability, action, flow, job

**Trigger**:
What starts a feature: a person through a page, a schedule, or an event.
_Rule_: a feature with two triggers is still one feature, written once.
_Avoid_: entry point, caller, hook

**Schedule**:
A trigger that fires at set times, such as every day at 08:00.
_Rule_: its timing is declared; the check finds the code that registers it,
and reports a declared schedule with no code, or code with no declaration.
_Avoid_: cron, timer, job

**Event**:
A trigger that arrives from outside the program, such as a webhook, a message
on a queue or a file landing in a folder.
_Rule_: what it carries flows into the feature it starts.
_Avoid_: hook, signal, message

## Code

**File**:
One source file, the smallest thing on the map.
_Rule_: a file belongs to exactly one module.
_Avoid_: script, source

**Module**:
A named set of files that does one job behind a front door of names.
_Rule_: code outside the module reaches it only through its front door; a
module never calls a feature or the UI.
_Avoid_: package, folder, component, service

**Front door**:
The names (functions, classes, values) that code outside a module is allowed
to use. Names, not files: which path an import is written through does not
matter.
_Rule_: every name used from outside a module is on its front door; any other
is a mismatch, and a use codegraph cannot resolve (`import *`) is reported as
unknown, not guessed.
_Avoid_: interface, public API, entry point, exports

**Test**:
A file that checks other code and is never used by the program itself. It is
an outside caller like any other, unless it is declared inside one module.
_Rule_: a test uses only front-door names, except in the one module it is
declared inside, if any; non-test code never imports a test.
_Avoid_: spec, check, suite

**Outside connection**:
Something the code reaches beyond its own process: a host, a database, a
broker, a feed, the environment.
_Avoid_: external, integration, dependency

## Data

**Store**:
One named place data is kept: a table or a collection inside a database, such
as members, services or reminders. The database is the outside connection;
its stores sit inside it.
_Rule_: each store has exactly one owning module, the only one that writes to
it; anything else that reads it is declared as a reader.
_Avoid_: table, collection, model, entity, database

## UI

**Page**:
A place a person can land in the program, such as a screen, a route or a view.
_Rule_: every declared page points at the code that draws it.
_Avoid_: screen, view, route

**Start page**:
The page a person lands on first, where every path through the UI begins.
_Rule_: every page can be reached from a start page by following leads-to
wires.
_Avoid_: home, landing page

**Component**:
A piece of UI that can appear on more than one page and behaves the same on
each.
_Rule_: a component's informed-by and acts-on wires belong to the component,
so every page that contains it shares them.
_Avoid_: widget, element, partial

## Wires

**Wire**:
A drawn connection between two things on the map. Every wire has one kind, and
its arrowheads show which way information flows: into the thing that receives
it. A wire that carries information both ways has a head at each end.
_Rule_: an arrowhead always sits where information arrives; leads-to is the one
wire that shows where a person moves instead.
_Avoid_: edge, link, arrow

**Uses**:
A wire between a feature and a module it calls: the request goes to the module
and the answer comes back.
_Rule_: two-way, with a head at each end; lands on the module's front door;
the module must be declared for the feature.
_Avoid_: calls, depends on, imports

**Informed by**:
A wire from a module or a feature into a page or component, carrying what it
shows.
_Rule_: one-way, into the UI; starts at a front door or a feature; nothing in
the UI is ever imported by a module.
_Avoid_: reads, fetches, queries

**Acts on**:
A wire between a page or component and the feature it starts, such as a button
that places a trade.
_Rule_: two-way, since the feature answers; lands on a feature, never straight
on a module.
_Avoid_: calls, drives, commands, writes

**Starts**:
A wire from a schedule or an event into the feature it starts.
_Rule_: one-way, into the feature; a person starts a feature through acts-on
instead.
_Avoid_: triggers, fires, calls

**Writes**:
A wire from a module into a store it changes.
_Rule_: one-way, into the store; only the store's owning module writes.
_Avoid_: saves, stores, updates

**Reads**:
A wire from a store into a module, or a page, that uses what it holds.
_Rule_: one-way, out of the store; comes from the owning module or a declared
reader.
_Avoid_: loads, fetches, queries

**Leads to**:
A wire from one page to another that a person can follow, by clicking or
otherwise.
_Rule_: runs from a page to a page, and stays in the UI.
_Avoid_: navigates, links to, drives

**Contains**:
A wire from a page or a component to a component it shows.
_Rule_: a component contains no page.
_Avoid_: renders, includes

## Checking

**Declaration**:
The file in a repo where people state the systems, features, triggers,
modules, stores, pages and wires they intend.
_Rule_: the declaration is the single source of truth; the code is checked
against it, never the other way round.
_Avoid_: config, manifest, spec

**Mismatch**:
One place where the code breaks a rule or disagrees with the declaration.
_Avoid_: violation, error, drift
