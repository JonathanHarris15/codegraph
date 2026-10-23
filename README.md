# codegraph

Point it at a Python codebase. It reads the imports and writes a page where
every file is a card and every import is a wire you can trace.

No model in the loop, no third-party packages. Python 3.10 or newer.

```
python codegraph.py ~/Personal\ Projects/Agent\ Trading\ Portal
open codegraph.html
```

```
39 files, 112 wires (16 of them imports inside a function), 11 folders -> codegraph.html
third party seen: alpaca, textual, rich, fastapi, httpx, pytest   (--externals draws these too)
```

## Options

| flag | what it does |
|---|---|
| `-o FILE` | where to write the page (default `codegraph.html`) |
| `--json` | print the data instead, so you can draw it yourself |
| `--externals` | give third-party packages their own cards |
| `--hidden` | read dotted folders too (`.claude`, `.github`) |

## On the page

Click a card and everything unrelated dims, so you can see what it imports and
what imports it. Drag cards about; the layout is kept in that browser. The
search box jumps to a file. Scroll to zoom, drag the background to pan.

A solid wire is a plain import. A dotted one is an import written inside a
function — the trick a CLI uses so that starting it loads nothing heavy.

## What it sees

It parses with the `ast` module, so it reads what is written, not what runs.

- `import a.b` and `from a.b import c`, resolved against the files it found
- `from . import x` and `from ..y import z`, counted from the file's package
- imports inside a `def` or a `class`, marked separately
- `from helpers import x` in a folder of loose scripts, meaning the file next door

Anything it cannot place inside the folder is third-party or standard library.
Standard library is dropped. Third-party is counted and named in the summary
line, and becomes a card with `--externals`.

What it does not see: imports built at runtime (`importlib`, `__import__`), a
module loaded from a file path, anything behind a plugin registry, and every
connection a program makes that is not an import — HTTP calls, databases,
queues. Those are the interesting wires, and finding them means reading calls
rather than imports.

## How the columns are chosen

Folders are sorted so that whoever imports sits left of whoever is imported —
a topological sort of the folder graph, cycles broken by taking the folder
with the fewest unmet dependents. Inside a folder, files sit in path order.
Folder colours come from the folder's place in that order, a golden angle
apart, so any codebase gets a usable palette without anyone picking one.

This is the weakest part and the most interesting one to replace. A folder is
a blunt unit: `atp/` holds both the command line that imports everything and
the model file that imports nothing, so they land in the same column. Sorting
by file rather than by folder, or running a proper force-directed pass, would
both do better.

## Tests

```
python -m unittest -v
```

They cover the part that can be quietly wrong: turning a path and an import
statement into the name of another file.
