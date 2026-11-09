# The build plan

How the new codegraph gets built, in checkpoints. Each checkpoint ends in
something a person can open and try. The words are in `../CONTEXT.md`; the
decisions in `adr/`.

Tickets are numbered `CG-<checkpoint>.<n>`. Each one is built test-first at
its seam and ends with the tests and the check clean. A ticket marked
**(ask)** needs a call from Jonathan before it starts; the rest can be built
and shown.

## Checkpoint 0: Ground

The app speaks the new words and the rules every repo will carry are written.

- **CG-0.1** Commit the glossary and ADRs 0002–0007. (done)
- **CG-0.2** (done) Rename codebase to software system through the app: the store,
  the features, the page. The projects file on disk is read in both shapes
  so nothing is lost.
- **CG-0.3** Write the tag rules and the codegraph config as ADR 0008 (done): what a
  tag says at each level, how a wire's kind and phrase are written beside the
  call, how a repo names its projects (ADR 0006). Every repo will carry
  these, so they are fixed before anything reads them.

## Checkpoint 1: The map, read-only

Open a project, see its map, zoom from project down to code, switch branch or
commit.

The map is first proven on a small repo the tests build by hand. Indie-stack
shows as "not set up" until checkpoint 2 sets it up; tagging it by hand now
would only be setup done badly.

- **CG-1.1** (done) The reader, in TypeScript (ADR 0005): reads the tags and config
  of a repo at a point (the live folder, a branch or a commit, ADR 0003) and
  returns its containers, components, code and wires. Uses the legacy Python
  as a guide, not a source.
- **CG-1.2** (done) Reading a project: its software systems, their wires to each
  other and to shallow software systems.
- **CG-1.3** (done) The canvas: cards and wires at each level, tunnelling by zoom,
  passing through levels with one card (ADR 0002).
- **CG-1.4** (done) The page map: pages as cards with leads-to wires, and an empty
  frame where the screenshot will go.
- **CG-1.5** (done) Branch and commit switcher on the canvas.
- **CG-1.6** (done) Open a project from the grid onto its own canvas.

**Try it:** open the test project, zoom to a component, switch to an older
commit and watch the map change. The click-through test does exactly this;
set `CODEGRAPH_PICTURES` to a folder to keep a picture of each step.

Still rough: wires can pass behind cards, and only TypeScript and
JavaScript are read for names and imports.

## Checkpoint 2: Setup through the MCP

Point your own agent at indie-stack and have it set up in one sweep.

- **CG-2.1** (done) The MCP server: a container of its own that serves the map, the
  check, and every instruction the agent needs (ADR 0004).
- **CG-2.2** (done, but for CI) The check, in TypeScript: every file tagged,
  every wire has its words, tags match the code. Runs from the MCP and from a
  terminal (`node out/main/mcp.js check`). CI before merge waits on CG-2.9.
- **CG-2.3** (done) The setup instructions: many sub-agents, one sweep; reshape the
  code to fit the conventions; tag every file and write every wire's words;
  write the config naming its projects; tell the agent to change its own
  context file; carry over legacy tags whose meaning holds and delete the
  rest of the legacy residue (`CLAUDE.md` block, `.claude` plugin line,
  `plans/`, `.codegraph/`).
- **CG-2.4** (done) Screenshots: the UI tests take a picture of each page they walk
  and the page map shows it.
- **CG-2.5** (done) Shallow software systems suggested from calls out of the code,
  shown only once a person agrees.
- **CG-2.6** (done) GitHub discovery reads the config, not the old plugin file
  (ADR 0006).
- **CG-2.7** (done) Set up indie-stack for real, on a branch, and merge it.
- **CG-2.8** (done) Give each project in the app its short name, the one repos name
  in their config (ADR 0008), and match repos to projects by it. Today the
  app's project names happen to match.
- **CG-2.9** Publish the MCP as a package, so another repo's CI can run the
  check without this folder on the machine.

**Try it:** indie-stack's whole map on the canvas, screenshots on its pages.
The projects page shows the one command that connects Claude Code to the
MCP; after that, "set this repo up for codegraph" is enough.

On a busy level, a card with many wires into it shows each wire's verb alone
and lists the full sentences beside the card when it is pointed at.

## Checkpoint 3: Sketches

Draw on a project and keep what you drew.

- **CG-3.1** (done) Drawing tools on the canvas: cards, wires, text, at any level.
- **CG-3.2** (done) The sketch library, kept with the project in the app.
- **CG-3.3** (done) Start a sketch from a snapshot of the map.
- **CG-3.4** (done) Mockups on a sketch's pages, picked from a file. Dragging a
  picture straight onto a card is still to come.
- **CG-3.5** (done) The MCP serves a sketch to the agent.

**Try it:** snapshot indie-stack, sketch a new page, hand it to your agent
and have it describe what it sees.

The MCP's `sketches` and `sketch` tools hand a sketch over in words, with
the file of each mockup for the agent to open. A sketch drawn as a sketch
can stop at any level; opening an empty card is how you draw inside it
(ADR 0011).

After the canvas design pass, drawing was rebuilt around how Lucidchart
works: a card library beside the tools, dots on a card's sides to draw
wires (a click on one adds a wired card beside it), typing straight onto
cards and wires, box and Shift picking, dragging groups with alignment
guides and grid snapping, a bar over what is picked, a right-click menu,
undo and redo, copy, paste, duplicate and Alt-drag, the arrow keys, and a
panel that always says what is picked or how to draw. Every wire reads as a
sentence, everywhere: "write-note uses notes to save the note".

Still to come: dragging a picture straight onto a card for its mockup;
cards that can be resized.

## Checkpoint 4: Proposals

Draw a change; the agent builds it while you watch.

- **CG-4.1** (done) A proposal file on its branch, one per branch (ADR 0007), drawn
  over the map: unbuilt parts look unbuilt.
- **CG-4.2** (done) Draw a proposal directly on the canvas.
- **CG-4.3** (done) The agent makes proposals from a sketch through the MCP, one per
  software system it changes.
- **CG-4.4** (done) The agent reports which card it is on, and the canvas follows.
- **CG-4.5** (done) The built rule: the check says when a proposal is built, and the
  change that builds it deletes it.
- **CG-4.6** (done) Mockups on a proposal shown beside the page's screenshot.

**Try it:** "take this sketch, make it the proposal on this branch, then
build it," and watch indie-stack change on the canvas.

The file and what the check holds it to are in ADR 0008. Over the map, a card
still to build is dashed with a "To build" mark, one built says so, and one
crossed out is struck through. The bar shows how many parts are built; the
list behind it names each, and anything that changed without being drawn.
The canvas redraws itself whenever a repo's files change, a branch is checked
out, or the agent says where it is, and follows the agent unless told not
to. "Propose a change" draws over the map: what is added is to build, and
Delete crosses out what is in the code. On the main line it first makes a
branch. A proposal stops at components; what goes inside them is the agent's.

The agent's tools are `propose` (from a sketch) and `working-on`; the
`proposals` topic of `instructions` tells it how to build one.

Still rough: a proposal is drawn per software system, so a wire between two
systems is not proposed yet; that comes with checkpoint 6.

## Between checkpoints: annotations

Done after checkpoint 4, at Jonathan's ask. Maps and sketches carry
annotations (ADR 0009): text, sticky notes, callouts, lines and arrows,
frames, lists, code blocks, flowchart shapes, containers and shapes, from a
library beside the tools (Shift+A) that is searched by name. Each sits on a
layer (Shift+L), shown or hidden, and each layer says whether it lines up with the
diagram's cards. An annotation dropped by a card keeps beside it as the card
moves; a line's end holds the card or annotation it lands on. Cards never
line up with annotations. Frames and boxes sit behind the cards and are
picked by their edge or title, so the board inside them still pans. A
picked annotation gets a bar to colour, duplicate or delete it, and Ctrl+Z
undoes on the map as in a sketch. The MCP's `map` and `sketch` tools say
what is drawn and where, and that it is not the architecture.

A sketch's old notes became sticky notes on a Notes layer, and every way to
add a note now adds one.

## Between checkpoints: moving the map about

Done after annotations, at Jonathan's ask. A card and a wire's sentence can
be dragged anywhere on a map as well as on a sketch, so a crowded level can
be untangled (ADR 0010). Where things were put is an arrangement, kept
beside the map; a right-click puts one card or the whole level back. Going
into a card is now a double-click, since the single click picks it up, and
pointing at a card and pressing F fills the screen with it. Hovering a card
lights the wires into and out of it, with a dash running the way each
arrow points.

## Between checkpoints: keys like an art program

One letter for each thing you reach for, and it works whatever is picked:
V pick, H pan, Z zoom box, W wire, N sticky note, T text, A arrow, L line,
R rectangle, O circle, D decision. 1 to 9 pick the cards of the level being
drawn, in the card library's order, so the same key means the first kind at
every level. [ and ] step through the annotation layers. ? lists them all.
So letters can always pick tools, no key writes on anything: a double-click
on a card's name or what it is for changes that field, and on a wire or a note
writes on it. A new card still opens ready for its name.

A sticky note has a dot on each edge. Drag one out and it points an arrow
anywhere, or click it for a short one: a pointer, part of the note, holding
nothing at its tip. Delete takes a picked pointer, not its note, and dragging
its tip back on the note takes it too.

## Checkpoint 5: Codegraph sets itself up

Run setup on this repo. The desktop app is reshaped and tagged. Legacy shows
as a container that gets tags only, no reshaping, until it is retired.

- **CG-5.1** Set up Codegraph on a branch and merge it.
- **CG-5.2** Point the desktop `CLAUDE.md` at the new check and drop the
  Python one.

## Checkpoint 6: A new project from a drawing

Draw a project that does not exist yet and have the agent make it.

- **CG-6.1** The agent makes a repo for a software system that has none, sets
  it up, and adds the proposal to it.
- **CG-6.2** Link the new repos to the project in the app as they appear.

**Try it:** sketch a two-system project from nothing and hand it over.

## Checkpoint 7: Working together

Projects and sketches online; members see each other at work. Decided in ADRs
0016 to 0021. Everything that talks to Firebase sits behind one front door, the
`cloud` module, with a folder on disk standing in for it until the Firebase
project exists. `docs/firebase.md` lists what is left to connect.

- **CG-7.1** (done) The cloud front door, and the stand-in.
- **CG-7.2** (done, but for the real sign-in) Sign-in with GitHub; members and roles;
  invites; handing over.
- **CG-7.3** (done) Each map keeps its own arrangement and notes; merges.
- **CG-7.4** (done) GitHub maps and local maps, with no working copy needed, and
  software systems out of reach.
- **CG-7.5** (done) Proposals only from sketches, never on the main line.
- **CG-7.6** (done) A computer's copy and the online copy keep in step, offline too.
- **CG-7.7** (done) Cursors, badges and held things.
- **CG-7.8** (done) Revisions and restoring them.
- **CG-7.9** (done) Loose sketches: their library, sharing, moving, copying.
- **CG-7.10** Connect Firebase, and test sign-in on the real project. *Connected: sign-in proven,
  rules deployed (`npx firebase deploy --only firestore:rules,database,storage`), one
  person's project goes up and comes back. Left: two computers, and testing the rules.*

**Try it:** `npm run together` opens two windows as two members, with a folder
standing in for Firebase. Link a repo in one, and move about in both.

Still rough:

- Signing in as someone else on the same computer keeps the first person's loose
  sketches there, and drops their projects. Each computer is taken to be one person's.
- A squash merge cannot be told from git's history, so the main line keeps its
  layout and picks up no notes (ADR 0019).
- A member's own layout on a local map is not kept apart per computer's repo: two
  working copies of one repo on one computer share it.
- Dragging a sticky note holds it for others, but its ring is only drawn on cards.
- The stock card library is per computer, as before; it does not go online.
- The drawing options a directly drawn proposal used (`floor`, `locked`) are left in
  the canvas, unused.

## Checkpoint 8: Stores and their shapes

See what a database holds, design the one it should become, and have setup
hold the code to it. Decided in ADR 0023. Proven on Mosaic, which keeps about
60 Firestore stores with nothing holding their shape.

- **CG-8.1** (done) The reader reads stores: `store X in Y inside Z from
  P.schema.json`, and the shape from that JSON Schema — each field, fixed or
  open, what an open part holds, and `pointsAt` as `points at` wires between
  stores. A store with no schema to read has its shape unknown. Nothing draws
  them yet: the canvas skips wires between stores until CG-8.2.
- **CG-8.2** (done) Stores on the map: a database opens to its store cards,
  fields on their faces, inner stores inside their stores, `points at` wires
  between them, and `keeps` wires reaching the store. The MCP's `map` says the
  same, a field to a line. A store card lists eight fields and says how many
  more; a field every record has is in bold, and one that points at a store
  shows that store instead of what it holds.
- **CG-8.3** (done) Stores on a sketch: inside a database the card library
  offers only a store, and inside a store only an inner store. A picked store's
  fields are written in the panel beside the board, not on the card: a row
  each, with what it holds, what it points at, and whether every record has it.
  A new store is fixed with no fields; switching it to open asks what any other
  field holds. Pointing a field at a store drawn beside it wires the two. A
  snapshot carries stores as they stand; the MCP's `sketch` says them.
- **CG-8.4** (done) Stores in a proposal: the file lists each store it adds,
  changes or crosses out with its whole shape, and the built rule holds the
  schema to it, saying what each store still lacks. A change that touches the
  records already kept names its migration, and is not built until the script
  is there; crossing a store out needs none, since its records are left alone.
  A new module that keeps only stores the proposal draws counts as part of
  them. Over the map, a new store is drawn faint with its fields, and a
  changed one is marked to build until its schema matches.
- **CG-8.5** (done) Setup and the check: the setup instructions find every
  store, give each one module, write its schema from the writes the code really
  makes, fixed only where the code proves it, and check every write against it;
  they leave the data alone and list changes to it as sketches to draw. The
  check reports a store whose tag names no schema, at that tag, with the fix.
  Every repo already set up fails the check until its stores have schemas.
- **CG-8.6** (ask) Set Mosaic's stores up for real, on a branch, and try it
  before merging.

**Try it:** open Mosaic's database, open `people`, see its inner stores and
everything that points at it. Snapshot it, close an open store on the sketch,
and hand it to the agent as a proposal with its migration.

Later: the shape writes the field checks in Firestore's own rules, so a write
that skips the code is caught too.

Still rough: a `points at` line drawn by hand on a sketch, or one left behind
when a field stops pointing, is not tidied up; only the field counts.
