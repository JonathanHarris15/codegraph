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
can stop at any level; tunnelling into an empty card is how you draw inside
it.

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

## Later

- Sharing projects and sketches live online.
- **(ask)** Where projects live once they are online, and who can see them.
