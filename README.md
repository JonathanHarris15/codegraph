# codegraph

Point it at a Python codebase. It reads the imports and writes a page where
every file is a card and every import is a wire you can trace. It also hunts
for what the code reaches outside itself — hosts, databases, feeds, the
environment — and draws those as cards too.

No model in the loop, no third-party packages. Python 3.10 or newer.

```
python codegraph.py ~/Personal\ Projects/Agent\ Trading\ Portal
open codegraph.html
```

```
36 files, 125 wires (16 of them imports inside a function), 12 folders -> codegraph.html
8 columns deep
reaches outside: 4 feed, 3 HTTP call, 2 serves HTTP, 1 market data / orders, 1 environment, 1 database
    127.0.0.1:8787             http /
    alpaca                     market data / orders
    api.typesafe.ai            https /v1/systemone
    environment                .env + os.environ
    sqlite                     database
    www.coindesk.com           https /arc/outboundfeeds/rss/
    ...
```

## Options

| flag | what it does |
|---|---|
| `-o FILE` | where to write the page (default `codegraph.html`) |
| `--json` | print the data instead, so you can draw it yourself |
| `--externals` | give third-party packages their own cards |
| `--hidden` | read dotted folders too (`.claude`, `.github`) |
| `--no-outside` | imports only; skip the hunt for connections |
| `--layout folder` | one column per folder, the older arrangement |
| `--keep-empty` | keep empty `__init__.py` files that nothing imports |
| `--draft` | write a first declaration of modules and front doors |
| `--check` | read the code against the declaration; exit 1 on a mismatch |
| `--declaration FILE` | the declaration to use (default `ROOT/codegraph.json`) |

## Declaring modules

A file is too small to think in. A **module** is a named set of files that
does one job, and its **front door** is the list of names code outside it may
use. You write these down in `codegraph.json` at the root of the codebase;
codegraph reads the code back and reports every place the two disagree.
`CONTEXT.md` defines the words.

```json
{
  "modules": {
    "engine": {"files": ["atp/engine/*"], "front_door": ["Book", "tick"]},
    "data":   {"files": ["atp/data/*"],   "front_door": ["AlpacaBars"]}
  },
  "tests": {
    "files": ["tests/**"],
    "inside": {"tests/test_book_and_gate.py": "engine"}
  }
}
```

```
python codegraph.py ../atp --draft     # one module per folder, doors as they are today
python codegraph.py ../atp --check
```

```
tests/test_book_and_gate.py:4  uses gate from engine, which is not on its front door
tests/test_hub.py:14  uses create_app from hub, which is not on its front door
11 mismatches, 0 cannot tell
```

The rules it checks:

- every program file is in exactly one module, and every module's patterns
  match at least one file
- every name one module takes from another is on that module's front door,
  whichever path the import is written through: `from atp.data import
  AlpacaBars` and `from atp.data.bars import AlpacaBars` are the same use
- a test goes through front doors like any other caller, unless it is listed
  under `inside`, which lets it reach into that one module
- the program never imports a test

In a pattern, `*` stays inside one folder and `**` spans any depth, so
`atp/*` is atp's own files and not atp/engine's.

A name is followed however it is reached: `from a.b import X`, `import a.b as
m` then `m.X`, `from a import b` then `b.X`. Two uses cannot be told and are
listed apart, not guessed: `import *`, and a module bound whole and then
handed to something else.

A draft's front doors hold exactly what the program takes across today, so
the program passes at once and only tests that reach in are flagged. That is
a record of now, not a design: narrow each door to what *should* cross.

## On the page

Click a card and everything unrelated dims, so you can see what it imports,
what imports it, and what it reaches outside. Drag cards about; the layout is
kept in that browser. Hold shift and drag across empty space to pick several
cards, or shift-click to add or drop one; dragging any picked card moves them
all. The search box jumps to a card. Scroll to zoom, drag the
background to pan; neither has a limit, so you can wander off the graph and
**Fit**, in the corner, brings it back. The legend folds away from its header.

The page opens on the codebase's modules: one card per module, wires between
them, and the outside connections each module makes. Click a module to see
its front door and the names that cross each wire; a red wire, and a red
name, is one that is not on the front door. Double-click a module, or press
**Open**, to go inside it: its own files sit in a thin box, the modules it
uses and its outside connections to the left, the modules that use it to the
right, so every wire crossing the box is another module coming in or going
out. The trail at the top says where you are, and a
step in it, or Escape, climbs back out. A codebase with no modules at all
falls back to one card per file.
A module card lists its files; the small arrow folds the list away, and a
click on a file goes inside the module with that file picked out. With the
list open, an arrow lands on the file that pulls the wire in, and when
several files do, the wire splits just outside the card into a thread for
each. Folded, the wires meet the card's side again. Each wire meets a card at
a point of its own, so two wires running opposite ways between the same pair
show as two.
The modules come from `codegraph.json` if the codebase has one, and otherwise
from a draft, one module per folder, which the header says.

Grey wires are imports — dotted means the import is written inside a function,
the trick a CLI uses so that starting it loads nothing heavy. Every other
colour is a connection that leaves the process, and the legend names each one.

## What it sees

It parses with the `ast` module, so it reads what is written, not what runs.

**Imports**

- `import a.b` and `from a.b import c`, resolved against the files it found
- `from . import x` and `from ..y import z`, counted from the file's package
- imports inside a `def` or a `class`, marked separately
- `from helpers import x` in a folder of loose scripts, meaning the file next door

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

Adding a probe is one line in `PROBES`: a glob over the call's dotted name, the
kind of wire, and a fixed service name or `None` to take the destination from a
URL in the same file.

## What it does not see

Imports built at runtime (`importlib`, `__import__`), a module loaded from a
file path, anything behind a plugin registry. A URL assembled from pieces, or
held in another file, or read from config at runtime. Connections made by
something that is not Python — a launchd job, a shell script, a Dockerfile.
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

All of the placement happens in `place_by_file`, which hands the page a
column and a row per card. The page only turns those into pixels, so a new
layout is a Python function and nothing else.

## Tests

```
python -m unittest -v
```

99 of them, over the parts that can be quietly wrong: turning a path and an
import statement into the name of another file, deciding that a call reaches
outside the process, laying the result out so no wire points backwards, and
deciding whether a name crossed a front door.
