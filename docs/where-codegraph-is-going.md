# Where codegraph is going

An honest look at what codegraph is today, what it is meant to become, and
the steps between. Written 2026-10-29. Nothing here is decided until it lands
as an ADR.

## The short version

Codegraph already does the hard half: it draws the map *from* the code, keeps
the code to its rules, and redraws after every turn. What it cannot do yet is
take an idea *in* through the map. Today the only way in is a button that puts
a sentence in the chat box. Everything you describe — drawing boxes, writing
prose in them, the agent proposing a design you approve, dropping in page
designs — is the same missing piece: **a plan that lives on the map until it is
built, and then gives way to what was really built.**

Build that one piece, and the rest are surfaces on it.

## What codegraph is today

- **A rulebook and a checker.** Every file carries a tag saying what it is
  (module, feature, page, component, test, tooling). Codegraph reads what the
  code really does and lists every place the two disagree. The rules are
  strong and have been tested on a real 209-file repo.
- **A map read from the code.** Three views: the map (stores, modules,
  features, pages in bands, with typed wires), the pages (where a person can
  go, from the start page), and the files. Double-click a card to see its own
  files. It redraws itself after every turn.
- **A thin line back to the agent.** Buttons on the map — Fix, Ask about it —
  fill the chat box with a sentence, and a person can draw a plan on it (see
  Decided).

What it is not yet:

- **Not a drawing tool.** You cannot add a card, draw a wire, write in a box,
  or drop an image. The map is read-only.
- **Not nested.** There are two depths: the whole map, and one card's files.
  There is no box that holds boxes — no app, no deployable, no system drawn as
  a container — and no way down into a file's names.
- **Not two-way about intent.** The agent cannot show you a design before it
  builds it, and the map cannot show you "this is what you asked for, this is
  what got built."

## What you are after

Pulling your description apart, there are six things:

1. **Opinions, kept.** The architecture has rules and the code is held to them.
   *Mostly there.*
2. **The map is the code.** Not a layer on top that the code is checked
   against; drawn from the code, true at the end of every turn. *There* —
   ADR 0002 already says this.
3. **Maps inside maps.** A file sits in a module, a module in a system, a system
   in an app, and you can zoom through each level. *Two levels of the five.*
4. **Draw to build.** You draw boxes and wires, write loose prose in each box,
   send it. The agent fixes what breaks the rules, builds it, and the map then
   shows what was really built. *Missing.*
5. **The agent proposes, you approve.** From a ramble or a ticket, the agent
   draws the change it means to make; you see it on the map, approve it, and it
   gets built. *Missing.*
6. **Pages from designs.** Drop Claude Design screens (images or HTML) onto
   page cards, wire which page leads to which, and the agent works out where
   the buttons go and builds the routes. *The page map exists; nothing can be
   dropped or drawn on it.*

Four and five are the same thing seen from two ends: a plan on the map. Six is
four on the pages view.

## Where I'd push back

**The map should not become a programming language.** You said "a visual
coding language". I'd draw a firm line: the map is the language for
*structure and intent* — what the boxes are, how they connect, what each is
for. Behaviour stays in code and tests. Once boxes start holding logic, you
are building a second, weaker programming language, and the map stops being
something you can trust at a glance. The prose in a box is a request to the
agent, not source code.

**A plan must die when it is built.** This is the one rule that keeps the
vision honest with ADR 0002. A plan is a request, not a declaration. Once
built, the plan goes away and the map is read from the code alone. Anything
from the plan that did not get built shows as "planned, not built" until you
drop it or the agent builds it. If plans linger after building, you have
rebuilt the `codegraph.json` that ADR 0002 threw out.

**The reader is now on the critical path.** Today a wrong reading costs a
false mismatch. Once you compare "what you drew" to "what got built", a wrong
reading tells you the agent built the wrong thing when it didn't. The
real-repo run found most of the reading gaps and most are fixed (insider
tests, shape helpers, commands, the shell, Firebase stores). One big one is
left, and it happens to be the same thing as the missing top level of the
nesting: **one repo is not always one program.** A browser app, cloud
functions and a script toolkit in one repo need to be separate boxes. That is
"maps inside maps" and a reading fix at once.

**The page is getting big for one hand-written file.** The map is 72KB of
plain JavaScript in one HTML file, with no build step. Adding an editor —
draw cards, drag wires, type prose, drop images — on top of that will hurt.
Either accept a build step for the page, or keep the editor very small. I lean
to a build step and a real layout library that handles boxes inside boxes
(ELK does), but it is your call: the plugin installing with nothing but
Python is worth something.

## The path

Each step ships something you can use on its own. The order puts the core loop
first and the drawing after, because the drawing just writes the same plan the
agent can already write.

**1. Plans, written by the agent, shown on the map.**
A plan is a small file in the repo (say `plans/<name>.json`): cards and wires
to add or change, each card with its prose. The agent writes one when you
ramble or hand it a ticket. The map draws plan cards and wires as ghosts —
dashed, over the real map — and marks any that break a rule red, with the
reason. An **Approve** button sends "build plan X". After the build, ghosts
that now match real cards vanish; what is left shows as "planned, not built"
or "built differently". When nothing is left, the plan file is deleted.
*This proves the whole loop with no editor at all.* It needs an ADR ("a plan
is a request, not a declaration") and a new word in CONTEXT.md.

**2. Draw the page flow, with designs.**
The first editor, on the smallest surface: the pages view has one kind of card
and one kind of wire. Add a page card, drop a screenshot or HTML from Claude
Design on it, draw leads-to wires between pages, send. The agent builds the
routes and decides where the links go; the design-pull skill already knows how
to bring a design into code. As a bonus, the UI tests already walk every page —
have them save a screenshot as they go, and the built page map shows real
screens, so you can lay "what I drew" beside "what got built".

**3. Draw on the whole map.**
Add any kind of card with prose in it, drag wires between cards. Only wires
the rules allow can be drawn — a page can't wire straight to a store — so the
first round of "correcting your mistakes" happens as you draw, before the agent
ever sees it. The agent still catches the deeper ones when it reads the plan.

**4. Maps inside maps.**
Add the levels that are missing: the app at the top, then each program it
ships as (deployable), then systems as boxes holding their features, then
modules and pages, then files, then a file's front-door names at the bottom.
Zoom moves between levels on one canvas rather than jumping to a new view.
Drawing works at every level: a box drawn inside a system is a feature of that
system. This is where the layout library earns its keep.

**Alongside all four: keep the reader honest.** Separate programs in one repo
first, then whatever each step turns up. Every reading gap now shows as a false
"built differently".

## What the map still leaves out

Detailed architecture diagrams show six things codegraph does not, most
useful first:

1. **Separate programs, and how they talk**: browser app → server over HTTP →
   database, each named with what it is built in.
2. **What crosses each wire**: what a feature or front-door name takes and
   gives. The types are often in the code already.
3. **People and what they may do**: roles, and which features each may start.
4. **The order of steps in a feature.** Features are thin by rule, so the
   order of module calls is there to read in a few lines.
5. **How stores relate**: a service has members.
6. **Health on each card**: has tests, tests pass, changed lately.

Left out on purpose: every class and function, hosting, and plumbing such as
logging. They crowd the map and the agent reads code at that depth anyway.

## Decided

- A plan is deleted once it is built (docs/adr/0008).
- Step 1 comes first, and plans can say the top three above — which program,
  takes and gives, and which roles — from the start, before codegraph reads
  them from the code.
- Plans live in `plans/` in the repo.
- Step 1 is built: the agent writes plans and the map shows them.
- Step 2 is built without a build step for the map page: on the Pages view a
  person sketches pages, links and designs, and sends the sketch as a plan.
  The one page file is now large; step 3 is where a build step pays for
  itself.
- Step 3 has begun, still without a build step: a right click on the map or
  the pages view makes a module, feature or page where it lands, flies in to
  it, and the person types what it is for in the card itself; a page takes a
  design from Claude Design. A system can be drawn as a box that says what
  its features should do, for the agent to work out. Every card has a dot on
  each side to drag a wire from; the map picks the wire the rules allow, or
  refuses. The + buttons that only filled the chat box are gone.
- New cards take their place in the box for their kind, stores included;
  designs come from a `designs/` folder in the repo. A person can comment on
  any card and write a note on any wire. The agent's revision of a drawing is
  shown on the same map as suggestions against it, with its comments.

## What I need from you

1. **Build step for the map page, or not?** Step 1 does without one; step 2,
   the first drawing, is where it starts to matter.
