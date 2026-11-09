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
No code says who they are, so a person is drawn, not read. A person has nothing
inside, so their card does not open.
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
on disk, and owned by one module. A Firestore collection, a SQL table and a
folder of files are each a store. It holds records, and its card shows its shape.
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

## What a store holds

**Record**:
One thing kept in a store: a person, a service, a roster entry.
_Avoid_: document, row, entry, item

**Field**:
One named value in a record, and what it holds: text, a number, a date, a
list, or a record of its own.
_Avoid_: key, column, property, attribute

**Shape**:
A store's fields and what each holds. Read only from a schema the code runs,
never from a comment or the live data; a store with no schema to read has its
shape unknown, not guessed.
_Avoid_: schema (for this), model, type, structure

**Fixed**:
A shape that lists every field a record may have. Any other field is wrong.
_Avoid_: discrete, strict, closed, rigid

**Open**:
A shape whose records may carry fields it does not list. It still says what an
unlisted field holds, or that it can hold anything, which is loose. A field
holding a record of its own is fixed or open too, so a fixed store can keep an
open map inside it.
_Avoid_: continuous, dynamic, free-form, schemaless

**Inner store**:
A store that lives inside each record of another and goes when its record goes,
like each person's own prayer requests. Drawn as a card inside its store's card.
_Avoid_: sub-collection, child, nested store, subtable

**Points at**:
What a field does when it holds another record's id. Drawn as a wire from one
store to the other, worded by the field: roster points at people for who is
serving.
_Avoid_: foreign key, reference, relation, link

## The map

**Canvas**:
The one surface a project is drawn on; each project has its own. Moving
between levels is opening cards on it, never going to a new page.
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
write-note uses notes to keep the note. The wire runs through its sentence, so
the two cannot come apart. It is a smooth line from card to card, and only moving
the sentence itself bends it; moving a card it joins lets go of that again.
_Avoid_: edge, arrow, link, connection, dependency

**Hub**:
Where a wire meets the border of an open card on a drawing. Parts inside the card
wire to it, any number of them, to say what the wire from outside really reaches.
It belongs to the wire and goes with it.
_Avoid_: port (for this), junction, socket, connector

**Opening**:
Double-clicking a card so it grows where it is into room to draw in, pushing
the cards and annotations around it aside. The cards wired to it stay on screen, at
the same zoom, but fade, further the further out they are, and cannot be touched
until a person backs out to them, except annotations, which Shift can still pick.
Cards not wired to it are not drawn at all.
Backing out is the way back; the card shrinks and what it pushed returns.
_Avoid_: tunnelling, drilling down, expanding, zooming in

**Room**:
How much of the canvas an open card has. A person can drag its corners or
sides to change it, and it grows by itself to hold whatever is carried past
its edge. It is kept with the card, and is never smaller than what it holds.
_Avoid_: subcanvas, size, frame, viewport

**Arrangement**:
Where a person has moved a map's cards and its wires' sentences, and the room
they have given its open cards. No code says where anything sits, so an
arrangement is kept beside the map, never in a repo, and moving something
changes no code. People shift cards out of the way all the time, so there is
nothing to protect: each branch has its own, and they are free to differ. A
merged branch's map takes the layout of whichever side was last worked on. A
sketch holds its own.
_Avoid_: layout, positions, coordinates, pins

**Framing**:
Filling the screen with one card without going into it, for reading a
crowded level a card at a time.
_Avoid_: focus, isolate, maximise

**Page map**:
What a container's pages look like on the canvas: each page shown by its
screenshot, with wires for which page leads to which.
_Avoid_: site map, routes, flow, UI container

**Screenshot**:
A picture of a page as it really is, taken as the tests click through it.
_Avoid_: capture, preview, thumbnail

**Mockup**:
A picture of how a page should look, dropped onto a sketch by a person. On a
proposal made from that sketch it is shown beside the page's screenshot.
_Avoid_: design, wireframe, comp

## Drawing

**Card type**:
What a person calls a kind of card on a sketch inside a software system, which is
not the name of any one card, with the icon, shape and colour it is drawn in. A
person can save one to the card library. It is what gets tagged in the code, after
`as`, unless the agent building it and the person agree on better. A database and a
page are not card types: they do more than look a certain way.
_Avoid_: preset, style, stencil

**Template**:
A card type that comes with the app, for a kind the code can name: a web app, a
server, a feature. It is the same card with a ready-made look.
_Avoid_: preset, stencil

**Sketch**:
A drawing that is not read from any repo: any diagram at all, sometimes started
from a snapshot of a map. An agent can be handed a sketch to make proposals
from: one for each software system it changes, making the repo first where
there is none.
_Avoid_: drawing, draft, plan, diagram

**Sketch library**:
Where sketches are kept. Each project has one, which all its members can see,
and each member has their own outside any project. A sketch can be moved from a
member's own library into a project's.
_Avoid_: directory, sketch gallery

**Folder**:
A place inside a sketch library to keep sketches in, which can hold other folders.
A project's folders are shared by everyone on it; a member's own follow them.
Deleting one keeps what was in it, a level up.
_Avoid_: directory, collection, group

**Loose sketch**:
A sketch in a member's own library, on no project. It is theirs alone until they
share it.
_Avoid_: personal sketch, draft, local sketch

**Snapshot**:
A copy of the map as it stood at one moment, used to start a sketch.
_Avoid_: export, copy, baseline

**Proposal**:
A sketch being made real on one branch of one software system, and the only way
a change gets drawn over a map. An agent reads the sketch as it stands, and puts
its faint outline over the map of a branch, never the main line. The outline
turns solid as its parts become real code. A branch has at most one. Later
changes to the sketch are a further round of work, not part of this proposal.
_Avoid_: plan, request, spec, ticket, sketch

**Annotation**:
Text, a sticky note, a shape or a line drawn over a map or a sketch for people
and agents to read. It is not part of the diagram and never changes the code.
On a map it belongs to that branch, and comes along when the branch is merged.
It can keep beside a card, or point at one, but no card ever lines up with
or moves for an annotation. An annotation does move for a card that opens.
_Avoid_: note (for anything but a sticky note), comment, markup, decoration

**Note**:
An annotation that carries words of its own: text, a sticky note, a callout,
a list, a code block. It shows on its face what goes in it, so an empty one
still says what it is for.
_Avoid_: label, comment, markup

**Frame**:
An annotation drawn round what it holds. It sits behind the cards, so the
board inside it still pans and picks, and it grows as the cards inside it do.
Its name sits on a tab at its corner, or along the strip of a swimlane or a
column. Nothing it holds belongs to it: it says what a group of cards is, and
the cards never move for it.
_Avoid_: container (that is what runs on its own), group, region, zone

**Pointer**:
An arrow a sticky note grows out of its own edge, to show what it means. It is
part of the note: it moves, copies and goes with it. Unlike a line, it holds
nothing at its tip, and stays where it is put.
_Avoid_: tail, leader, connector, callout

**Layer**:
A set of annotations shown or hidden together. Each says whether its
annotations line up with the diagram's cards. The diagram itself is never on
a layer and is always shown.
_Avoid_: overlay, group, sheet

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

## Working together

**Member**:
Someone on a project, known by their GitHub account: their name beside their
cursor and beside their work. Not the same as a person, who uses the software
the project is about.
_Avoid_: user, account, teammate, person (for this)

**Owner**:
The one member a project answers to. The project points at them and does not
sit under them, so it can be handed to another member whole.
_Avoid_: creator, admin

**Working copy**:
A repo's folder on one member's computer.
_Avoid_: local repo, clone, checkout

**GitHub copy**:
A repo as GitHub holds it, which a working copy is compared against.
_Avoid_: cloud repo, remote, origin, upstream

**Co-owner**:
A member who can do all an owner can, except hand over or delete the project.
_Avoid_: admin, manager

**Collaborator**:
A member who can draw, move things, add repos and rename the project, but cannot
say who else is on it.
_Avoid_: editor, contributor

**Viewer**:
A member who can look and point, and whose cursor others see, but who changes
nothing.
_Avoid_: guest, reader

**GitHub map**:
The map read from a GitHub copy, at a branch or a commit. Any member GitHub lets
into the repo can open it, and members on the same one see each other.
_Avoid_: cloud map, remote map, shared map

**Local map**:
The map read from a member's own working copy: a local branch, or the folder as
it stands. No one else ever sees it.
_Avoid_: private map, my map

**Out of reach**:
A software system on a project that a member cannot open right now, because
GitHub has not let them into the repo or because they are offline. It is greyed
out and says which. It still has a repo, so it is not shallow.
_Avoid_: shallow (for this), locked, disabled, unavailable

**Held**:
A card, wire or note that one member is dragging or typing on. No one else can
touch it until they let go.
_Avoid_: locked, checked out, reserved

**Revision**:
One entry in a project's history: what one member changed in one stretch of
work. Restoring an old one adds a new revision, so nothing is lost.
_Avoid_: version, save, commit, snapshot

**Gallery**:
The page listing the projects a member is on.
_Avoid_: dashboard, grid, home
## Instructions

**Instructions**:
What codegraph tells an agent, by topic: how to set a repo up, the tag rules,
how to make and build a proposal, and the block a set-up repo carries in its
own context file. An agent asks for them through the MCP.
_Avoid_: prompt, rules, docs, guidance

**Default**:
The words codegraph ships with for a topic. A person who has written their own
can always put it back.
_Avoid_: original, built-in, factory, stock

**Edit**:
One saved state of a topic's instructions: the words as they stood, when they
were kept, and whether a person wrote them or put the default back. The newest
is what agents are told, and none is ever taken away, so nothing a person has
written is lost.
_Avoid_: version, revision, draft, history entry
