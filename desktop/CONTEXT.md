# codegraph

A map of a project's software, read from its code at the levels people think
in, which people and agents can also draw on to say what should change. The
levels follow C4.

## The levels

**Project**:
The outermost thing: one or more software systems that people work on as one.
_Avoid_: product, workspace, solution, portfolio

**Short name**:
What a project's repos call it, like `harris-appraisals`. It stays the same
when the project is renamed, so no repo has to change.
_Avoid_: slug, key, id, handle

**Person**:
Someone who uses a project's software, drawn beside its software systems.
No code says who they are, so a person is drawn, not read.
_Avoid_: user, actor, persona, role

**Software system**:
One repo, seen whole. It can serve more than one project, and it says in its
own code which ones.
_Avoid_: codebase, app, service, repo (say repo for the git folder itself)

**Shallow software system**:
A software system a project refers to but has no repo for, usually because
someone else runs it. Codegraph may suggest one when the code calls out to
it, but it is only on the map once a person agrees. Linking a repo to it later
makes it an ordinary software system.
_Avoid_: external, third party, integration, dependency

**Container**:
A part of a software system that runs on its own: a browser app, a server, a
database, a function, a command-line tool.
_Avoid_: program, layer, deployable, service, process

**Component**:
One part of a container that does one job behind a clear front. Every
component is a module, a feature, a page or a trigger.
_Avoid_: unit, element, block, class

**Code**:
The files, and the names inside them, that make up a component. The bottom
level.
_Avoid_: source, implementation

## Kinds of component

**Module**:
A component that does real work behind a small front door. Only a module
touches stored data or anything outside its container. A part that more than
one page shows, and the design system, are modules too.
_Avoid_: service, library, helper, util, widget

**Front door**:
What a module lets other components use. Nothing else of it is theirs.
_Avoid_: API, interface, exports, public surface

**Store**:
One kind of thing kept in a container that keeps things, a database or files
on disk, and owned by one module.
_Avoid_: table, collection, model, entity

**Feature**:
A component for one thing a person, a schedule or an event asks the software
to do. It is thin and gets its power from modules.
_Avoid_: use case, action, flow, job

**Page**:
A component a person sees and acts through. What a person sets off on a page
is handed to a feature.
_Avoid_: screen, view, route, template

**Trigger**:
A component that starts a feature without a page: a schedule, an event from
outside, or a command someone types.
_Avoid_: hook, handler, entry point, cron

## The map

**Canvas**:
The one surface a project is drawn on; each project has its own. Moving
between levels is zooming on it, never opening a new page.
_Avoid_: board, diagram, graph, view

**Map**:
The picture of a project's real software, read from its code, drawn on the
canvas. It shows the code at whatever point is being looked at: the live
folder, a branch or a commit.
_Avoid_: graph, diagram, model, architecture

**Card**:
One thing drawn on the canvas at any level: a project, a software system, a
container, a component.
_Avoid_: node, box, unit, element, shape

**Wire**:
A one-way line between two cards. It shows the kind of relationship, read
from the code, and a phrase saying what it is for, written in the code beside
the call. It reads as a sentence: who acts, how, on what, and what for —
write-note uses notes to keep the note.
_Avoid_: edge, arrow, link, connection, dependency

**Tunnelling**:
Moving down a level by zooming into a card: it opens in place, its insides
drawn within it, while the cards around it and their wires into it stay in
view. Tunnelling out is the way back up.
_Avoid_: drilling down, expanding, opening

**Page map**:
What a container's pages look like on the canvas: each page shown by its
screenshot, with wires for which page leads to which.
_Avoid_: site map, routes, flow, UI container

**Screenshot**:
A picture of a page as it really is, taken as the tests click through it.
_Avoid_: capture, preview, thumbnail

**Mockup**:
A picture of how a page should look, dropped onto a sketch or a proposal by a
person. On a proposal it is shown beside the page's screenshot.
_Avoid_: design, wireframe, comp

## Drawing

**Sketch**:
A drawing kept with a project that is not read from any repo: any diagram the
team wants, sometimes started from a snapshot of the map. An agent can be
handed a sketch to make proposals from: one for each software system it
changes, making the repo first where there is none.
_Avoid_: drawing, draft, plan, diagram

**Snapshot**:
A copy of the map as it stood at one moment, used to start a sketch.
_Avoid_: export, copy, baseline

**Proposal**:
A change drawn over the map of a software system on one branch, which an
agent builds until the map matches it. A branch has at most one. A person can
draw one directly, or an agent can make one from a sketch.
_Avoid_: plan, request, spec, ticket, sketch

**Crossed out**:
A card or wire a proposal takes away. Its wires go with it. Over the map it
stays in view, struck through, until the code no longer has it.
_Avoid_: deleted, removed, struck

**Built**:
A proposal is built when everything it draws exists, everything it crosses out
is gone, nothing it did not draw has changed since the commit it was drawn on,
the tests pass and every file is tagged. Building it ends the proposal; the
sketch it came from stays.
_Avoid_: done, complete, merged, shipped

## Setting up

**Tag**:
A short, structured line in a file saying which component the file belongs
to.
_Avoid_: annotation, marker, label, comment

**Set up**:
A software system whose code has been reshaped to fit codegraph's
conventions, carries tags throughout, and names its projects.
_Avoid_: installed, configured, onboarded, initialised
