> **Legacy.** This is the first codegraph: the Claude Code plugin. It still
> works and still installs, but new work happens in `../desktop`, the app a
> person opens. Changes here are fixes, not features.

# codegraph

A way to build a codebase in three layers, and a tool that keeps it honest.

- **Modules** do the real work behind a small front door, and are the only
  code that touches a database or anything outside the program.
- **Features** are what a person, a schedule or an event asks the app to do.
  Each is thin and gets its power from the modules it names.
- **UI** is how a person reaches features: pages, components, and the design
  system they are drawn with.

Codegraph is set up *in* a repo, not pointed at it (docs/adr/0010). Every source file says
in a tag which of these it belongs to, and the code is the architecture:
there is no separate document to keep up to date (docs/adr/0002). Codegraph
reads what the code really does, checks it against the tags, and draws the
result as a map where every broken rule shows red. `CONTEXT.md` has the
words.

## Install

Codegraph is one plugin in your own Claude, set up in each repo you want
it in. Give an agent this repository's link:

```
Install codegraph: https://github.com/JonathanHarris15/codegraph
```

It follows [INSTALL.md](INSTALL.md) and turns the plugin on in your Claude
settings (`python codegraph.py --profile` does it by hand), once per
machine. From the next session it loads in every project and keeps itself up
to date. Where a repo is not set up, it stays out of the way.

Then, in a repo, run `/codegraph:setup`: it writes the rules into the repo's
`CLAUDE.md`, tags every file, and turns the plugin on in the repo's committed
`.claude/settings.json` as well, so anyone else who opens the repo gets it
too. Run it again to update a repo once codegraph's rules change; the row
above the chat box says when they have. Ask the agent to install codegraph
"in this repo" and it does both at once.

The repo is a Claude Code plugin. Installing it gives you three things:

- the **live map** in a browser tab inside Claude Code: `/codegraph` opens
  it, or `/codegraph:open` in the desktop app, whose slash menu lists only
  skills. It is the whole page below, served on this machine alone, and it
  talks back: **Fix** on any mismatch, **Fix all** and **Ask about it** on any card
  each fill the chat box with the prompt, ready to send, and a right click
  draws something new (below). **Show** finds a mismatch's card on the map, a red
  dot marks every card that has one, and the list folds away. After every
  turn the page reads the code again and redraws, keeping your place.
  Where no browser tab can open, `/codegraph-pane` shows a smaller map in a
  pane beside the chat.
- three **tools** the agent calls: `check`, run after every change, `map`,
  read before deciding where work goes, and `open`, which opens the live map.
- four **skills**: `/codegraph:setup` brings a repo under codegraph, or updates one,
  `/codegraph:fix` fixes one mismatch at a time, test first,
  `/codegraph:plan` puts a change on the map as a plan before it is built,
  and `/codegraph:open` opens the live map.

To work on codegraph itself, add this folder as a marketplace (the repo
lists itself in `.claude-plugin/marketplace.json`), then install from it:

```
claude plugin marketplace add "path/to/codegraph"
claude plugin install codegraph@codegraph
```

The install is a copy. After changing the code here, take the new version
with:

```
claude plugin marketplace update codegraph
claude plugin update codegraph@codegraph
```

To try a working copy for one session instead, start Claude Code with this
folder as a plugin:

```
claude --plugin-dir "path/to/codegraph"
```

Python 3.10 or newer runs the program. It reads Python on its own; for
TypeScript and JavaScript it needs tree-sitter (docs/adr/0001):

```
pip install tree-sitter tree-sitter-typescript tree-sitter-javascript
```

## Setting a repo up

`/codegraph:setup` works on a fresh repo or an old one, on a branch. It
tags every file with a first guess, corrects each guess by reading the code,
writes the rules into the repo's `CLAUDE.md` so every agent there builds in
the three layers and test first, and hands back the mismatches, worst first.
Setup changes no behaviour; fixing is `/codegraph:fix`, one small change at a
time (docs/adr/0004). On a repo already set up it is the update: the rules
become this codegraph's, and only files with no tag get one.

## Plans

A plan is a change someone wants, put on the map before any code is written
(docs/adr/0008). Tell the agent what you want, ramble or ticket, and
`/codegraph:plan` writes it to `plans/<name>.json`: the cards and wires to add
or change, each card with a few plain lines on what it is for, and where known
which program it ships in, which roles may start it, and what it takes and
gives.

The map draws what the code has not got yet as dashed cards and wires over
the real map, red where the plan breaks a rule, and the agent corrects those
before you see it. **Plans** in the header lists each one, what is left to
build, and **Build it**. As the code is written the dashed cards go; a card the
code has but short of what was asked says what is left. Once nothing is left,
the plan is deleted: the check reports a built plan still in `plans/` as a
mismatch. The map is only ever read from the code.

You can also draw a plan yourself. Right-click empty space on the map or the
**Pages** view and pick a new module, feature, page, store or system: the
card takes its place in the box for its kind (modules, features, pages,
outside + stores), the view flies in to it, and you type in the card itself,
its name and in plain words what it is for (Tab moves on, Enter keeps it,
Esc takes it back). Drag a card by its edge or its top. Drag a new feature
into a system's box to say it belongs there: as you drag, the box it leaves
closes up and the box under it opens a gap for it; one made by right-clicking inside a system starts
there. A new system says in plain words what its features should do, and the
agent works each one out; right-click it to draw a feature in it yourself.

A page can take a design from Claude Design. Export the page into `designs/`
at the root of the repo (an HTML file, a picture, or a folder with an
index.html); **Pick a design…** on a page shows every design there as it
looks. codegraph never reads `designs/` as code. Every card
has a dot on each side: drag it onto another card and the map draws the wire
the rules allow between them (a feature uses a module, a page acts on a
feature, a page leads to a page), whichever way you dragged, or says why
there is none. Write a few words on a wire as you draw it, if you like, to
say what you imagine it carries; click a wire you drew to change that or
delete it. Every card also has a comment button: ask a
question or make a suggestion, and it goes with the drawing.

When the agent has checked a drawing, the map shows its revision against what
you drew, like suggested edits in a document: what it added in teal, what it
struck out crossed through in red, reworded text with the old words struck
and the new ones underlined, and a comment on each change saying why. Press
**Keep mine** where you disagree, **Ask why**, or reply in a card's comments;
**Build it** when you are happy.
Zoom out and carry on; click a new card to edit it again, or remove it from
there. **Send** writes the drawing to `plans/`, designs beside it in
`plans/<name>/`, and asks the agent to check it: it fills in what the cards
need, corrects what breaks a rule, and tells you before it builds. Where links sit on each
page is the agent's call; you only say where a person can go. Designs are
shown boxed in: an HTML design may not run a script.

## Tags

One comment line each, in a file's first 30 lines. `#` or `//` both work.

```python
# codegraph: module members
# codegraph: front door find_members, add_member     once per module
# codegraph: store members as Member                 on the schema it owns
# codegraph: shape of members                        this file prints its shape
# codegraph: reads services                          another module's store
```

```ts
// codegraph: feature plan-service in calendar
// codegraph: uses services, members
// codegraph: schedule every Thursday at 08:00       or: event paid as PaidEvent
// codegraph: command import-sales                   a person runs it at a terminal

// codegraph: start page home at /                   or: page members
// codegraph: component people-picker
// codegraph: design system
// codegraph: shell                                  the nav and router every page sits in

// codegraph: test module members                    or: test feature X, test ui home, members
// codegraph: fakes ./render because jsdom has no canvas
// codegraph: tooling
```

A module of five files is five files with the same tag. A page's route comes
from its framework where it can (Next.js `app/` and `pages/`), else from `at`.

## The rules the check reads

```
python codegraph.py path/to/repo --check
```

- every source file has a tag, and every module one front door line
- every name taken from a module is on its front door, whichever path the
  import is written through; a module's own tests are insiders and may use
  any of its names (docs/adr/0005)
- a module never calls a feature or the UI; a feature never calls another
  feature or reaches into the UI; a page never imports a page; a component
  never contains a page; the design system imports nothing that has wires;
  the program never imports a test or tooling
- a feature names its system and the modules it uses, uses only those, and
  has a trigger: a page that acts on it, a command, a schedule or an event
- only a module reaches an outside connection (a server is how requests
  arrive, so serving is allowed anywhere) or a store; a store has one owner,
  the only module that writes it, and other modules say they read it
- every store has a schema codegraph can read: pydantic, dataclasses,
  TypedDict, SQLAlchemy, SQL `CREATE TABLE`, TypeScript types, zod, Prisma
  (docs/adr/0003); stores are read from SQL, from `.collection("x")`, and
  from Firebase's `collection(db, X)` with `X` a constant
- where the fields are not in the code to read, because an outside source
  decides them, the owning module holds a **shape helper**: a file tagged
  `shape of <store>` that prints `{"name": "Sale", "fields": {...}}` when it
  is run. codegraph runs it and shows what it says (docs/adr/0006);
  `CODEGRAPH_NO_HELPERS=1` runs none of them
- there is a start page, every page can be reached from it by its links (the
  shell's links lead from every page), and a UI test walks every page
- a test fakes only what is outside the program, never the repo's own code,
  unless it says why in a `fakes ... because ...` tag

What it cannot tell, it lists apart rather than guess: `import *`, a module
handed around whole, a link built while the program runs, an event with no
schema named, a schema built while the program runs, and a file of the
program that only tests reach.

## Options

| flag | what it does |
|---|---|
| `-o FILE` | where to write the page (default `codegraph.html`) |
| `--check` | read the code against its tags; exit 1 on a mismatch |
| `--draft` | write a first tag into every file that has none |
| `--install` | turn codegraph on in the repo: the plugin in `.claude/settings.json`, the rules in `CLAUDE.md`, `.codegraph/` in `.gitignore` |
| `--profile` | turn codegraph on in your own Claude settings, for every project; takes no folder |
| `--summary` | print what the pane shows, as JSON |
| `--serve` | serve the live map on this machine; print each request it sends, one JSON line each |
| `--port N` | the port `--serve` uses (default: any free one) |
| `--json` | print all the data instead of the page |
| `--externals` | give third-party packages their own cards |
| `--hidden` | read dotted folders too (`.claude`, `.github`) |
| `--no-outside` | imports only; skip the hunt for connections |
| `--layout folder` | the file view in one column per folder |
| `--keep-empty` | keep empty `__init__.py` files that nothing imports |

A repo nobody has tagged is drawn from a draft held in memory, and the page
says so.

## On the page

The page opens on the **map**, in bands as data flows to a person: outside
connections, stores (each listing its shape), modules, features (coloured by
system), schedules and events, then components and pages. Each wire says
what it is: a feature *uses* a module, a page *acts on* a feature and is
*informed by* a module, a module *writes* and *reads* its stores, a schedule
*starts* a feature. The arrowhead sits where information arrives. A red wire
breaks a rule, and the panel says which.

**Pages** is the map of where a person can go: every page, from the start
page on the left, with the links that lead between them. A repo with no
modules yet is drawn as every file and every import instead.

Click a card and everything unrelated dims; the panel lists its front door,
system, route or shape, and its wires. Double-click a card, or press
**Open**, to go inside it: its own files sit in a thin box, with what they
touch around them. The count in the header opens the list of mismatches.
Drag cards about; the layout is kept in that browser. Shift-drag picks
several. Scroll to zoom, drag the background to pan, and **Fit** brings
everything back. On a wide map the wires can be more than you want at once:
a wire starts out showing only while you
point at one of its cards, or while a card it touches is picked, drawing
itself on as it comes. Red wires always show. **Wires: on hover** turns into
**All wires** when you want them all at once.

Grey wires are imports; dotted means the import is written inside a
function. Every other colour is a wire the legend names.

### What each page looks like

On the live map, a page card shows a picture of the page as a UI test last
saw it, with the day it was taken; click the card for a bigger one. Nothing
is drawn for it: the picture is the real page in a real browser. Once the
page's files change after the picture was taken, it fades and says so, until
the tests run again.

To take the pictures, copy one helper into the repo's tests and call it
wherever a test has a page up. Run the tests from the repo's root. The copy
is the repo's own test tooling now, not codegraph's module: change its tag to
`// codegraph: tooling`, or drop it where the repo has no tags yet.

- Cypress: `modules/snapshots/cypress.js` (and `cypress.d.ts` beside it
  where the tests are TypeScript), then `snapshot()`
- Playwright: `modules/snapshots/playwright.mjs`, then `await snapshot(page)`

The map finds the page by the address the test is at. Where codegraph cannot
read a page's route, name the page instead: `snapshot('notes-new')`. Each
picture is noted in `.codegraph/shots/`; keep that folder out of git.

## What it sees

It parses, it does not run: it reads what is written. Everything that depends
on the language sits in one reader per language — `PythonReader` and
`ScriptReader` — which says what a file imports, which names it takes from
other files, and what it calls outside. The modules, the check and the page
work the same whatever the language. A new language is a new reader.

**Imports in Python**

- `import a.b` and `from a.b import c`, resolved against the files it found
- `from . import x` and `from ..y import z`, counted from the file's package
- imports inside a `def` or a `class`, marked separately
- `from helpers import x` in a folder of loose scripts, meaning the file next door

**Imports in TypeScript and JavaScript**

- `import ... from`, `export ... from`, `require()`, and `import()` written
  inside a function, which counts as an import inside a function
- a relative path with or without its ending, a folder's `index` file, and a
  `.js` ending standing for the `.ts` file on disk
- the shortcuts in `tsconfig.json` under `paths` and `baseUrl`, following
  `extends`, with the comments and trailing commas tsconfig allows
- a package in the same repository, by the name in its `package.json`
- Node's own modules (`node:fs`, `path`) left out; anything else that does not
  land on a file counted as a third-party package, `@scope/name` whole
- `.d.ts` files left out: they declare types and run nothing
- a name taken through `import * as x` is read by what is used off it, `x.Book`

**Connections out**

Two kinds of evidence, combined per file:

- a URL written as a string, which gives the destination — `https://api.typesafe.ai/v1/systemone` becomes a card named `api.typesafe.ai`, port kept if there is one
- a call that matches the probe table in `PROBES`, which gives the *sort* of
  connection: `sqlite3.connect`, `httpx.Client`, `requests.*`, `feedparser.parse`,
  `alpaca.*Client`, `boto3.client`, `psycopg*.connect`, `redis.*Redis`,
  `FastAPI()`, `subprocess.run`, `os.getenv` and so on

The library beats the URL scheme when they disagree, because it knows more:
`feedparser.parse("https://...")` is a feed, not a plain HTTP call. A probe
matches after the file's own imports have been followed, so `from httpx import
Client` then `Client(...)` is seen the same as `httpx.Client(...)`.

A client with no URL beside it — `httpx.Client(base_url=cfg.url)` — gets a card
named after the library, saying the destination is not in the source. That is
the honest answer: the URL lives in another file and following it there is
dataflow analysis, not parsing.

Adding a probe is one line in `PROBES`, or `SCRIPT_PROBES` for TypeScript and
JavaScript: a glob over the call's dotted name, the kind of wire, and a fixed
service name or `None` to take the destination from a URL in the same file.
In TypeScript the name is the package and what is taken from it, so
`import { spawn } from "node:child_process"` then `spawn()` is
`child_process.spawn`, and `new Anthropic()` is `@anthropic-ai/sdk`.

A URL with a scheme codegraph does not know, `obsidian://` or `slack://`,
opens an app rather than reaching a host, and is left out.

## What it does not see

Imports built at runtime (`importlib`, `__import__`), a module loaded from a
file path, anything behind a plugin registry. A URL assembled from pieces, or
held in another file, or read from config at runtime. Connections made by
something no reader reads — a launchd job, a shell script, a Dockerfile.
Languages other than Python, TypeScript and JavaScript, for now.
Which account a client picks at runtime: a broker that chooses paper or live
from a flag is one card, not two.

## How the columns are chosen

A wire is drawn as flowing *into* the file that imports: the arrowhead sits
on the importer, the way information moves. So the columns run the same way.

Each **file** is given a depth: one past the furthest thing that imports it,
so a file nothing imports has depth 0. The columns are those depths read right
to left: what nothing imports lines up on the right, the things everything
depends on sit on the left, and outside connections, where data comes from,
take the first column of all.

That rule has a useful consequence. Since a file always sits at least one
column left of anything that imports it, **every import wire points
rightward**. A wire going backwards would mean a cycle, and there are none to
draw because cycles are broken first: one depth-first walk marks the edges
that close a loop, and the layering ignores them.

Rows inside a column are then shuffled to cut down crossings — the barycentre
heuristic, which puts a card level with the average of the cards it is wired
to, sweeping back and forth a few times.

Folder is no longer the unit, but it is still the colour: cards are tinted by
which folder they came from, a golden angle apart in hue, and the key in the
corner names them. `--layout folder` brings the old one-column-per-folder
arrangement back if you want to compare.

The file view's placement happens in `place_by_file`, the map's in
`place_map`; each hands the page a column and a row per card. The page only turns those into pixels, so a new
layout is a Python function and nothing else.

## How codegraph itself is built

Codegraph is set up on itself, in the same three layers it asks of others.
`python codegraph.py . --check` reads it like any other repo.

- `modules/`: source (reads each file and what it imports and reaches),
  tags, shapes, rules (the check's reading), planning (plans held against the map),
  drafting, installing (turns codegraph on for a person and in a repo), layout, drawing,
  web (serves the live map).
  Each folder's `__init__.py` is its front door.
- `features/`: check, draw-map, browse-map, draft-tags and install, each a few lines that call
  modules.
- the UI: `codegraph.py`, the command line, and `hooks/register.tsx`, the
  pane. Both are start pages.
- `tests/`: one file per module or feature, and `indie-stack`, a real app
  to try codegraph on (below).

## Tests

```
python -m unittest discover -s tests -t .
```

Over the parts that can be quietly wrong: turning a path and an import
statement into the name of another file, in each language, deciding that a
call reaches outside the process, laying the result out so no wire points
backwards, reading tags and schemas, and every rule the check reads. The
TypeScript ones skip themselves where tree-sitter is not installed.

The mod's own tests draw the pane on each surface and press its buttons:

```
claude plugin test .
```

## A real repo to try it on

`tests/indie-stack` is a small notes app (sign up, log in, write and delete
notes) built on Remix, Prisma and SQLite, from Remix's archived Indie Stack
(MIT). It is set up for codegraph and kept clean: every file tagged, the
pages' forms handed to features, `0 mismatches`. It has its own `CLAUDE.md`
with codegraph's block in it, so codegraph's own check leaves it out
(docs/adr/0009) and pointing codegraph at it reads it as a repo of its own.
`tests/test_example.py` keeps it clean: a change to codegraph that misreads
a real app fails there.

Read it, draw it, or serve the live map of it:

```
python codegraph.py tests/indie-stack --check
python codegraph.py tests/indie-stack --serve
```

To run the app and its tests once (Node 18 or newer):

```
cd tests/indie-stack
npm install
copy .env.example .env      # cp on macOS
npm run setup
npm run test:e2e:run
```

The click-through tests take a picture of every page they open, so the live
map shows each page as it looks.

For a full try, a plan, a sketch, a build, start Claude Code inside it with
this folder as the plugin, so it runs the working copy rather than the
installed one:

```
cd tests/indie-stack
claude --plugin-dir ../..
```

What a try turns up that codegraph gets wrong is a fix to codegraph, made
here with a test. A change to the app itself is kept only if the app stays
clean: run the check and `tests/test_example.py` before committing it.
