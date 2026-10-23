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
39 files, 125 wires (16 of them imports inside a function), 12 folders -> codegraph.html
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

## On the page

Click a card and everything unrelated dims, so you can see what it imports,
what imports it, and what it reaches outside. Turn **Imports** off to leave
only the outside wires. Drag cards about; the layout is kept in that browser.
The search box jumps to a file. Scroll to zoom, drag the background to pan.

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

Folders are sorted so that whoever imports sits left of whoever is imported —
a topological sort of the folder graph, cycles broken by taking the folder
with the fewest unmet dependents. Inside a folder, files sit in path order.
Outside connections go in a column of their own at the right. Folder colours
come from the folder's place in that order, a golden angle apart, so any
codebase gets a usable palette without anyone picking one.

This is the weakest part and the most interesting one to replace. A folder is
a blunt unit: `atp/` holds both the command line that imports everything and
the model file that imports nothing, so they land in the same column. Sorting
by file rather than by folder, or running a proper force-directed pass, would
both do better.

## Tests

```
python -m unittest -v
```

48 of them, over the parts that can be quietly wrong: turning a path and an
import statement into the name of another file, and deciding that a call
reaches outside the process.
