# codegraph

A map of a codebase drawn at the level people think in (systems, modules, pages),
not files. People declare the shape they intend; codegraph reads the code and
says where the two disagree. The same map is how a person tells an agent what
to build.

## Code

**File**:
One source file, the smallest thing on the map.
_Rule_: a file belongs to exactly one module.
_Avoid_: script, source

**Module**:
A named set of files that does one job behind a front door of names.
_Rule_: code outside the module reaches it only through its front door.
_Avoid_: package, folder, component, service

**Front door**:
The names (functions, classes, values) that code outside a module is allowed
to use. Names, not files: which path an import is written through does not
matter.
_Rule_: every name used from outside a module is on its front door; any other
is a mismatch, and a use codegraph cannot resolve (`import *`) is reported as
unknown, not guessed.
_Avoid_: interface, public API, entry point, exports

**System**:
A named set of modules that together own one area of the program and the
outside connections it needs.
_Rule_: each outside connection belongs to exactly one system, and systems
reach each other only through front doors.
_Avoid_: subsystem, service, layer, domain

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
A drawn connection between two things on the map. Every wire has one kind.
_Avoid_: edge, link, arrow

**Leads to**:
A wire from one page to another that a person can follow, by clicking or
otherwise.
_Rule_: runs from a page to a page, and stays in the UI.
_Avoid_: navigates, links to, drives

**Contains**:
A wire from a page or a component to a component it shows.
_Rule_: a component contains no page.
_Avoid_: renders, includes, uses

**Informed by**:
A wire from a page or component to the system that supplies what it shows.
_Rule_: lands on a system's front door, and never runs the other way; a system
never imports UI code.
_Avoid_: reads, fetches, queries

**Acts on**:
A wire from a page or component to a system it tells to do something, such as
a button that places a trade.
_Rule_: lands on a system's front door.
_Avoid_: calls, drives, commands, writes

## Checking

**Declaration**:
The file in a repo where people state the modules, systems, pages and wires
they intend.
_Rule_: the declaration is the single source of truth; the code is checked
against it, never the other way round.
_Avoid_: config, manifest, spec

**Mismatch**:
One place where the code breaks a rule or disagrees with the declaration.
_Avoid_: violation, error, drift
