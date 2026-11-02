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

- **CG-1.1** The reader, in TypeScript (ADR 0005): reads the tags and config
  of a repo at a point (the live folder, a branch or a commit, ADR 0003) and
  returns its containers, components, code and wires. Uses the legacy Python
  as a guide, not a source.
- **CG-1.2** Reading a project: its software systems, their wires to each
  other and to shallow software systems.
- **CG-1.3** The canvas: cards and wires at each level, tunnelling by zoom,
  passing through levels with one card (ADR 0002).
- **CG-1.4** The page map: pages as cards with leads-to wires, and an empty
  frame where the screenshot will go.
- **CG-1.5** Branch and commit switcher on the canvas.
- **CG-1.6** Open a project from the grid onto its own canvas.

**Try it:** open the test project, zoom to a component, switch to an older
commit and watch the map change.

## Checkpoint 2: Setup through the MCP

Point your own agent at indie-stack and have it set up in one sweep.

- **CG-2.1** The MCP server: a container of its own that serves the map, the
  check, and every instruction the agent needs (ADR 0004).
- **CG-2.2** The check, in TypeScript: every file tagged, every wire has its
  words, tags match the code. Runs from the MCP and in CI before merge.
- **CG-2.3** The setup instructions: many sub-agents, one sweep; reshape the
  code to fit the conventions; tag every file and write every wire's words;
  write the config naming its projects; tell the agent to change its own
  context file; carry over legacy tags whose meaning holds and delete the
  rest of the legacy residue (`CLAUDE.md` block, `.claude` plugin line,
  `plans/`, `.codegraph/`).
- **CG-2.4** Screenshots: the UI tests take a picture of each page they walk
  and the page map shows it.
- **CG-2.5** Shallow software systems suggested from calls out of the code,
  shown only once a person agrees.
- **CG-2.6** GitHub discovery reads the config, not the old plugin file
  (ADR 0006).
- **CG-2.7** Set up indie-stack for real, on a branch, and merge it.

**Try it:** indie-stack's whole map on the canvas, screenshots on its pages.

## Checkpoint 3: Sketches

Draw on a project and keep what you drew.

- **CG-3.1** Drawing tools on the canvas: cards, wires, text, at any level.
- **CG-3.2** The sketch library, kept with the project in the app.
- **CG-3.3** Start a sketch from a snapshot of the map.
- **CG-3.4** Drop mockups onto a sketch.
- **CG-3.5** The MCP serves a sketch to the agent.

**Try it:** snapshot indie-stack, sketch a new page, hand it to your agent
and have it describe what it sees.

## Checkpoint 4: Proposals

Draw a change; the agent builds it while you watch.

- **CG-4.1** A proposal file on its branch, one per branch (ADR 0007), drawn
  over the map: unbuilt parts look unbuilt.
- **CG-4.2** Draw a proposal directly on the canvas.
- **CG-4.3** The agent makes proposals from a sketch through the MCP, one per
  software system it changes.
- **CG-4.4** The agent reports which card it is on, and the canvas follows.
- **CG-4.5** The built rule: the check says when a proposal is built, and the
  change that builds it deletes it.
- **CG-4.6** Mockups on a proposal shown beside the page's screenshot.

**Try it:** "take this sketch, make it the proposal on this branch, then
build it," and watch indie-stack change on the canvas.

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
