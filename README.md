# codegraph

A way to build a codebase in three layers, and a tool that keeps it honest.

- **Modules** do the real work behind a small front door, and are the only
  code that touches a database or anything outside the program.
- **Features** are what a person, a schedule or an event asks the app to do.
  Each is thin and gets its power from the modules it names.
- **UI** is how a person reaches features: pages, components, and the design
  system they are drawn with.

Codegraph is set up *in* a repo, not pointed at it. Every source file says
in a tag which of these it belongs to, and the code is the architecture:
there is no separate document to keep up to date (docs/adr/0002). Codegraph
reads what the code really does, checks it against the tags, and draws the
result as a map where every broken rule shows red. `CONTEXT.md` has the
words.

## Install

The repo is a Claude Code plugin. Installing it gives you three things:

- a **pane** beside the chat with the map: systems and their features,
  modules and their front doors, pages, stores and their shapes, and the
  mismatches. Click a feature, module or page and the chat box fills with a
  prompt about it; the buttons start a new feature, module or page, or fix
  the next mismatch. `/codegraph` opens it.
- two **tools** the agent calls: `check`, run after every change, and `map`,
  read before deciding where work goes.
- two **skills**: `/codegraph:setup` brings a repo under codegraph, and
  `/codegraph:fix` fixes one mismatch at a time, test first.

To try it from a working copy, start Claude Code with this folder as a plugin:

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
time (docs/adr/0004).

## Tags

One comment line each, in a file's first 30 lines. `#` or `//` both work.

```python
# codegraph: module members
# codegraph: front door find_members, add_member     once per module
# codegraph: store members as Member                 on the schema it owns
# codegraph: reads services                          another module's store
```

```ts
// codegraph: feature plan-service in calendar
// codegraph: uses services, members
// codegraph: schedule every Thursday at 08:00       or: event paid as PaidEvent

// codegraph: start page home at /                   or: page members
// codegraph: component people-picker
// codegraph: design system

// codegraph: test module members                    or: test feature X, test ui home, members
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
  import is written through
- a module never calls a feature or the UI; a feature never calls another
  feature or reaches into the UI; a page never imports a page; a component
  never contains a page; the design system imports nothing that has wires;
  the program never imports a test or tooling
- a feature names its system and the modules it uses, uses only those, and
  has a trigger: a page that acts on it, a schedule or an event
- only a module reaches an outside connection (a server is how requests
  arrive, so serving is allowed anywhere) or a store; a store has one owner,
  the only module that writes it, and other modules say they read it
- every store has a schema codegraph can read: pydantic, dataclasses,
  TypedDict, SQLAlchemy, SQL `CREATE TABLE`, TypeScript types, zod, Prisma
  (docs/adr/0003)
- there is a start page, every page can be reached from it by its links, and
  a UI test walks every page
- a test fakes only what is outside the program, never the repo's own code

What it cannot tell, it lists apart rather than guess: `import *`, a module
handed around whole, a link built while the program runs, an event with no
schema named.

## Options

| flag | what it does |
|---|---|
| `-o FILE` | where to write the page (default `codegraph.html`) |
| `--check` | read the code against its tags; exit 1 on a mismatch |
| `--draft` | write a first tag into every file that has none |
| `--summary` | print what the pane shows, as JSON |
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
page on the left, with the links that lead between them. **Files** is every
file and every import.

Click a card and everything unrelated dims; the panel lists its front door,
system, route or shape, and its wires. Double-click a card, or press
**Open**, to go inside it: its own files sit in a thin box, with what they
touch around them. The count in the header opens the list of mismatches.
Drag cards about; the layout is kept in that browser. Shift-drag picks
several. Scroll to zoom, drag the background to pan, and **Fit** brings
everything back.

Grey wires are imports; dotted means the import is written inside a
function. Every other colour is a wire the legend names.

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
  tags, shapes, rules (the check's reading), drafting, layout, drawing.
  Each folder's `__init__.py` is its front door.
- `features/`: check, draw-map and draft-tags, each a few lines that call
  modules.
- the UI: `codegraph.py`, the command line, and `hooks/register.tsx`, the
  pane. Both are start pages.
- `tests/`: one file per module or feature.

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
