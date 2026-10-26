# codegraph

A map of a codebase drawn at the level people think in (systems, features,
modules, stores, pages), not files. Every file says in a tag what it is meant
to be; codegraph reads what the code really does and says where the two
disagree. There is no documentation apart from the code. The same map is how a
person tells an agent what to build.

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
_Rule_: a file carries exactly one tag, which says what it belongs to: a
module, a feature, a page, a component, the design system, a test, or
tooling. A file with no tag is a mismatch.
_Avoid_: script, source

**Module**:
A named set of files that does one job behind a front door of names.
_Rule_: code outside the module reaches it only through its front door; a
module never calls a feature or the UI; only modules reach outside
connections and stores.
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
a module test, a feature test or a UI test.
_Rule_: non-test code never imports a test; a test fakes only outside
connections, never code in the repo.
_Avoid_: spec, check, suite

**Module test**:
A test of one module, run through its front door.
_Rule_: uses only front-door names, the same as any other outside caller;
uses real stores where that is cheap, such as an in-memory database.
_Avoid_: unit test

**Feature test**:
A test that starts a feature the way its trigger would and runs the real
modules it uses.
_Rule_: checks the result the trigger gets back, not how the modules got it.
_Avoid_: integration test, end-to-end test

**UI test**:
A click-through that runs in a browser: open a page, act on it, follow its
leads-to wires and check what shows. Its written steps describe it; they do
not stand in for it.
_Rule_: every path from a start page is walked by at least one UI test.
_Avoid_: manual test, QA script

**Outside connection**:
Something the code reaches beyond its own process: a host, a database, a
broker, a feed, the environment.
_Rule_: only a module reaches one.
_Avoid_: external, integration, dependency

## Data

**Store**:
One named place data is kept: a table or a collection inside a database, such
as members, services or reminders. The database is the outside connection;
its stores sit inside it.
_Rule_: each store has exactly one owning module, the only one that writes to
it; any other module that reads it is declared as a reader; its tag sits on
the schema that defines its shape.
_Avoid_: table, collection, model, entity, database

**Shape**:
What a store holds, or what an event or a request carries in: its fields and
what kind each is.
_Rule_: read only from a schema the program itself uses, such as a database
model, a migration, a validator or a type; never from a comment; a schema
codegraph cannot read is shown as an unknown shape, not guessed.
_Avoid_: schema, model, type, structure

## UI

**Page**:
A place a person can land in the program, such as a screen, a route or a view.
_Rule_: tagged on the code that draws it; its leads-to wires are read from
the framework's router, and a link built while the program runs is reported
as unknown, not guessed.
_Avoid_: screen, view, route

**Start page**:
The page a person lands on first, where every path through the UI begins.
_Rule_: every page can be reached from a start page by following leads-to
wires.
_Avoid_: home, landing page

**Component**:
A piece of UI that can appear on more than one page and behaves the same on
each, such as a people picker. It may take settings, such as showing only
members, and may have wires.
_Rule_: a component's informed-by and acts-on wires belong to the component,
so every page that contains it shares them.
_Avoid_: widget, element, partial

**Design system**:
The look every page and component is built from: colours, type, spacing, and
plain pieces such as buttons and inputs.
_Rule_: has no wires; a piece that needs data or starts a feature is a
component.
_Avoid_: theme, style guide, UI kit

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
A wire from a store into a module that uses what it holds.
_Rule_: one-way, out of the store; lands on the owning module or a declared
reader; a page sees a store only through informed-by from a module.
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

**Tag**:
A comment line near the top of a file, starting `codegraph:`, that says what
the file belongs to, such as `# codegraph: module engine`. A module of five
files is five files with the same tag. One of them also lists the module's
front door; a feature's tag names its system and the modules it uses.
_Rule_: whoever changes a file keeps its tag true.
_Avoid_: annotation, marker, label, header

**Declaration**:
All the tags in a repo, read together: what the code says it is meant to be.
_Rule_: lives only in the code; there is no separate file; what the code
really does is checked against it.
_Avoid_: config, manifest, spec

**Tooling**:
A source file that builds, configures or runs the program but is not part of
it, such as a build script. Files that are not source at all, such as
settings and ignore lists, are not on the map.
_Rule_: tagged, and kept off the map.
_Avoid_: config, scripts, infra

**Setup**:
The one-time skill that brings a repo under codegraph: tags every source
file, installs the mod, writes the context file agents read, and lists the
mismatches to fix one at a time.
_Rule_: changes no behaviour of the program.
_Avoid_: init, install, onboarding

**Mismatch**:
One place where the code breaks a rule or disagrees with the declaration.
_Avoid_: violation, error, drift
