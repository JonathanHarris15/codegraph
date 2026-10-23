#!/usr/bin/env python3
"""codegraph - turn a Python codebase into a card-and-wire graph.

Point it at a folder. It parses every .py file with the ast module, works out
which imports land back inside that folder, and writes a standalone HTML page
you can open in a browser. No third-party packages, no model in the loop.

    python codegraph.py ../..                  # -> codegraph.html
    python codegraph.py ../.. -o graph.html
    python codegraph.py ../.. --json           # the data, nothing else
    python codegraph.py ../.. --externals      # third-party packages as cards too
    python codegraph.py ../.. --draft          # declare modules and front doors
    python codegraph.py ../.. --check          # read the code against them

What it knows how to see:

    import a.b            module-level import        -> kind "import"
    from .x import y      relative import, resolved  -> kind "import"
    def f(): import a.b   import inside a function   -> kind "lazy"

Anything the resolver cannot place inside the folder is third-party or standard
library. Standard library is dropped; third-party becomes a card only with
--externals.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from pathlib import Path
from urllib.parse import urlsplit

SKIP_DIRS = {
    ".git", ".hg", ".svn", ".venv", "venv", "env", "__pycache__", "node_modules",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".eggs",
    "build", "dist", "site-packages", ".idea", ".vscode",
}

TEMPLATE = Path(__file__).with_name("template.html")

# How each wire is drawn. A hue of None means the neutral grey the page uses
# for imports; everything else picks up the page's own saturation and
# lightness, so one table serves both the light and the dark theme.
KINDS = {
    "import":   {"label": "import", "hue": None, "dash": "", "width": 1.1},
    "lazy":     {"label": "import inside a function", "hue": None, "dash": "1 4", "width": 1.5},
    "http":     {"label": "HTTP call", "hue": 265, "dash": "7 4", "width": 1.5},
    "serves":   {"label": "serves HTTP", "hue": 205, "dash": "7 4", "width": 1.6},
    "database": {"label": "database", "hue": 170, "dash": "3 3", "width": 1.6},
    "market":   {"label": "market data / orders", "hue": 35, "dash": "7 4", "width": 1.6},
    "feed":     {"label": "feed", "hue": 320, "dash": "7 4", "width": 1.5},
    "queue":    {"label": "queue", "hue": 55, "dash": "7 4", "width": 1.5},
    "cloud":    {"label": "cloud service", "hue": 240, "dash": "7 4", "width": 1.5},
    "process":  {"label": "starts a process", "hue": 15, "dash": "10 5", "width": 1.6},
    "env":      {"label": "environment", "hue": 95, "dash": "3 3", "width": 1.4},
}

OUTSIDE = "(outside)"
EXTERNAL = "(external)"

# What a call has to look like for us to believe it leaves the process.
# The pattern is matched, fnmatch style, against the call's dotted name after
# the file's own imports have been followed: `from httpx import Client` then
# `Client(...)` is matched as `httpx.Client`.
#
# service=None means the library alone does not say where it is going. The
# destination then comes from a URL in the same file, and failing that the
# library itself becomes the card.
PROBES = (
    ("sqlite3.connect",             "database", "sqlite"),
    ("sqlalchemy.create_engine",    "database", None),
    ("psycopg*.connect",            "database", "postgres"),
    ("asyncpg.*connect*",           "database", "postgres"),
    ("pymysql.connect",             "database", "mysql"),
    ("MySQLdb.connect",             "database", "mysql"),
    ("pymongo.MongoClient",         "database", "mongodb"),
    ("redis.*Redis",                "database", "redis"),
    ("*.duckdb.connect",            "database", "duckdb"),
    ("duckdb.connect",              "database", "duckdb"),

    ("httpx.Client",                "http", None),
    ("httpx.AsyncClient",           "http", None),
    ("httpx.get", "http", None), ("httpx.post", "http", None),
    ("requests.*",                  "http", None),
    ("aiohttp.ClientSession",       "http", None),
    ("urllib.request.urlopen",      "http", None),
    ("urllib.request.Request",      "http", None),
    ("http.client.*Connection",     "http", None),
    ("openai.*",                    "http", "openai"),
    ("anthropic.*",                 "http", "anthropic"),

    ("feedparser.parse",            "feed", None),

    ("alpaca.*Client",              "market", "alpaca"),
    ("ccxt.*",                      "market", "ccxt"),
    ("yfinance.*",                  "market", "yahoo finance"),
    ("ib_insync.*",                 "market", "interactive brokers"),

    ("boto3.client",                "cloud", "aws"),
    ("boto3.resource",              "cloud", "aws"),
    ("google.cloud.*",              "cloud", "google cloud"),
    ("azure.*",                     "cloud", "azure"),

    ("fastapi.FastAPI",             "serves", None),
    ("flask.Flask",                 "serves", None),
    ("uvicorn.run",                 "serves", None),
    ("socket.socket",               "serves", None),

    ("celery.Celery",               "queue", "celery"),
    ("kafka.*",                     "queue", "kafka"),
    ("pika.*Connection",            "queue", "rabbitmq"),

    ("subprocess.run",              "process", None),
    ("subprocess.Popen",            "process", None),
    ("subprocess.check_*",          "process", None),
    ("os.system",                   "process", None),

    ("os.getenv",                   "env", "environment"),
    ("os.environ.get",              "env", "environment"),
    ("dotenv.load_dotenv",          "env", "environment"),
)

URL_RE = re.compile(r"""\b[a-z][a-z0-9+.\-]{1,12}://[^\s"'`<>\\{}|^]+""", re.I)

SCHEME_KIND = {
    "http": "http", "https": "http", "ws": "http", "wss": "http",
    "postgres": "database", "postgresql": "database", "mysql": "database",
    "mongodb": "database", "mongodb+srv": "database", "redis": "database",
    "sqlite": "database", "clickhouse": "database",
    "amqp": "queue", "amqps": "queue", "kafka": "queue",
    "s3": "cloud", "gs": "cloud", "file": None,
}


# --------------------------------------------------------------------- model

@dataclass(frozen=True)
class File:
    """One .py file, and the dotted name other files would import it by."""
    name: str          # atp.engine.tick
    path: Path
    rel: str           # atp/engine/tick.py
    group: str         # atp/engine  (the folder it sits in)
    package: str       # atp.engine  (what a relative import counts from)
    lines: int

    @property
    def label(self) -> str:
        return self.path.name


# ----------------------------------------------------------------- discovery

def discover(root: Path, hidden: bool = False) -> list[Path]:
    """Every .py file under root, minus the usual noise.

    Dotted folders are skipped unless asked for: a folder whose name starts
    with a dot cannot be imported, so anything in one is tooling, not code the
    project runs.
    """
    found: list[Path] = []
    for path in sorted(root.rglob("*.py")):
        parts = path.relative_to(root).parts[:-1]
        if any(p in SKIP_DIRS for p in parts):
            continue
        if not hidden and any(p.startswith(".") for p in parts):
            continue
        found.append(path)
    return found


def file_of(path: Path, root: Path) -> File:
    """Work out the dotted name, folder group and package for one file."""
    rel = path.relative_to(root)
    parts = list(rel.parts)
    stem = parts[-1][:-3]                       # drop .py
    folder = parts[:-1]

    if stem == "__init__":
        name_parts = folder                     # the package IS the module
    else:
        name_parts = folder + [stem]

    return File(
        name=".".join(name_parts) or stem,
        path=path,
        rel=rel.as_posix(),
        group="/".join(folder) if folder else ".",
        package=".".join(folder),
        lines=_count_lines(path),
    )


def _count_lines(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="replace").splitlines())
    except OSError:
        return 0


# ------------------------------------------------------------------- parsing

@dataclass(frozen=True)
class RawImport:
    module: str | None     # "atp.engine", or None for "from . import x"
    names: tuple[str, ...]
    level: int             # 0 absolute, 1 ".", 2 ".." ...
    nested: bool           # written inside a def or a class


def read_imports(path: Path) -> list[RawImport]:
    """Every import in one file, flagged for whether it sits inside a def."""
    try:
        source = path.read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(source, str(path))
    except (OSError, SyntaxError, ValueError):
        return []

    out: list[RawImport] = []

    def walk(node: ast.AST, nested: bool) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.Import):
                for alias in child.names:
                    out.append(RawImport(alias.name, (), 0, nested))
            elif isinstance(child, ast.ImportFrom):
                out.append(RawImport(
                    child.module,
                    tuple(a.name for a in child.names),
                    child.level or 0,
                    nested,
                ))
            deeper = nested or isinstance(
                child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
            )
            walk(child, deeper)

    walk(tree, False)
    return out


def absolute(imp: RawImport, package: str) -> str:
    """Turn a relative import into the dotted name it really means."""
    if imp.level == 0:
        return imp.module or ""
    base = package.split(".") if package else []
    if imp.level > 1:
        base = base[: len(base) - (imp.level - 1)]
    if imp.module:
        base = base + imp.module.split(".")
    return ".".join(base)


def resolve(target: str, names: tuple[str, ...], index: dict,
            package: str = "") -> list[str]:
    """Which files in the index does this import actually reach?

    `from atp.engine import book, gate` reaches two files; `from atp.models
    import Bar` reaches one. Importing a package reaches its __init__.

    A folder of loose scripts has no package name, so `import helpers` there
    means the file next door. If nothing matches outright, try that reading.
    """
    if not target:
        return []

    def hits_for(base: str) -> list[str]:
        found: list[str] = []
        if base in index:
            found.append(base)
        for name in names:
            deeper = base + "." + name
            if deeper in index:
                found.append(deeper)
        return found

    hits = hits_for(target)
    if not hits and package:
        hits = hits_for(package + "." + target)
    return hits


# ------------------------------------------------------- outside connections

@dataclass(frozen=True)
class Conn:
    """One connection a file appears to make to something outside itself."""
    kind: str          # http | database | market | feed | serves | ...
    target: str        # node id: net:api.example.com, svc:sqlite, env:environment
    label: str         # what the card says
    detail: str        # the line under it


ENVIRONMENT = Conn("env", "env:environment", "environment", ".env + os.environ")


def symbol_table(tree: ast.AST) -> dict:
    """What each imported name in this file really refers to.

    `from httpx import Client` makes `Client(...)` mean `httpx.Client`, and
    `import numpy as np` makes `np.array` mean `numpy.array`. Without this a
    probe table only ever matches code written one particular way.
    """
    syms: dict = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    syms[alias.asname] = alias.name
                else:
                    root = alias.name.split(".")[0]
                    syms[root] = root
        elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
            for alias in node.names:
                syms[alias.asname or alias.name] = node.module + "." + alias.name
    return syms


def dotted_name(node: ast.AST) -> str:
    """`a.b.c(...)` -> "a.b.c". Anything built at runtime -> ""."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return ""


def through_imports(name: str, syms: dict) -> str:
    """Rewrite a dotted name through this file's imports."""
    if not name:
        return ""
    head, _, tail = name.partition(".")
    origin = syms.get(head)
    if not origin:
        return name
    return origin + ("." + tail if tail else "")


def match_probe(name: str):
    from fnmatch import fnmatchcase
    for pattern, kind, service in PROBES:
        if fnmatchcase(name, pattern):
            return kind, service
    return None


def urls_in(tree: ast.AST) -> list:
    """Every URL written as a string literal, scheme and host pulled apart."""
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            for raw in URL_RE.findall(node.value):
                bits = urlsplit(raw.rstrip(".,);"))
                host = bits.netloc.split("@")[-1]
                if not host:
                    continue
                found.append((bits.scheme.lower(), host, bits.path or "/"))
    return found


def read_outside(path: Path) -> list:
    """What this one file appears to reach outside the process.

    Two kinds of evidence, both syntactic: a call that matches the probe
    table, and a URL written as a string. Neither is run.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except (OSError, SyntaxError, ValueError):
        return []

    syms = symbol_table(tree)
    conns: dict = {}

    def keep(conn: Conn) -> None:
        conns.setdefault(conn.target, conn)

    # Calls first. A library says what sort of connection this is, which is
    # worth more than the scheme on a URL: feedparser.parse("https://...") is
    # a feed, not a plain HTTP call.
    loose: list = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = through_imports(dotted_name(node.func), syms)
        hit = match_probe(name)
        if not hit:
            continue
        kind, service = hit
        if kind == "env":
            keep(ENVIRONMENT)             # however it was reached, it is one card
        elif service:
            keep(Conn(kind, "svc:" + service, service, KINDS[kind]["label"]))
        else:
            loose.append((kind, name))

    # os.environ["KEY"] is a subscript, not a call
    for node in ast.walk(tree):
        if isinstance(node, ast.Subscript) and \
                through_imports(dotted_name(node.value), syms) == "os.environ":
            keep(ENVIRONMENT)

    # Does one library in this file say what its URLs are for?
    speaks = {k for k, _ in loose if k in ("feed", "market", "database", "queue", "cloud")}
    house = speaks.pop() if len(speaks) == 1 else None

    hosts: set = set()
    for scheme, host, route in urls_in(tree):
        kind = SCHEME_KIND.get(scheme, "http")
        if kind is None:
            continue
        if house and kind == "http":
            kind = house
        hosts.add(kind)
        keep(Conn(kind, "net:" + host, host, scheme + " " + route))

    # A client with no URL beside it: name the library, not a destination.
    for kind, name in loose:
        if kind in hosts:
            continue                      # a URL in this file already says where
        lib = name.split(".")[0]
        keep(Conn(kind, "svc:" + lib, lib, _vague(kind)))

    return list(conns.values())


def _vague(kind: str) -> str:
    """What to write on a card when the library is all we know."""
    if kind == "serves":
        return "serves HTTP from this process"
    if kind == "process":
        return "runs other programs"
    return KINDS[kind]["label"] + ", destination not in the source"


# --------------------------------------------------------------------- build

def build(root: Path, externals: bool = False, hidden: bool = False,
          outside: bool = True, layout: str = "file",
          keep_empty: bool = False, decl: dict | None = None,
          source: str = "declared") -> dict:
    files = [file_of(p, root) for p in discover(root, hidden)]
    index = {m.name: m for m in files}

    edges: dict = {}
    ext_hits: dict = defaultdict(int)
    endpoints: dict = {}
    stdlib = getattr(sys, "stdlib_module_names", frozenset())

    def add(src: str, dst: str, kind: str) -> None:
        if src == dst:
            return
        key = (src, dst)
        # a real top-level import beats the same one hidden in a function
        if edges.get(key) == "import":
            return
        edges[key] = kind

    def note_endpoint(conn: Conn) -> None:
        was = endpoints.get(conn.target)
        if was is None or (was["dir"].endswith("not in the source") and conn.detail):
            endpoints[conn.target] = {
                "id": conn.target, "label": conn.label, "dir": conn.detail,
                "group": OUTSIDE, "lines": 0, "kind": "outside",
            }

    for f in files:
        for imp in read_imports(f.path):
            target = absolute(imp, f.package)
            kind = "lazy" if imp.nested else "import"
            hits = resolve(target, imp.names, index, f.package)
            if hits:
                for hit in hits:
                    add(f.name, hit, kind)
                continue
            top = target.split(".")[0]
            if not top or top in stdlib or top == "__future__":
                continue
            ext_hits[top] += 1
            if externals:
                add(f.name, "ext:" + top, kind)

        if outside:
            for conn in read_outside(f.path):
                note_endpoint(conn)
                add(f.name, conn.target, conn.kind)

    if not keep_empty:
        # An empty __init__.py that nothing imports is a folder marker, not a
        # file. Left in, it crowds the entry-point column with cards that
        # have no wires at all.
        wired = {s for s, _ in edges} | {d for _, d in edges}
        files = [m for m in files
                   if m.lines or m.path.name != "__init__.py" or m.name in wired]

    tail = ([EXTERNAL] if externals else []) + ([OUTSIDE] if endpoints else [])
    groups = order_groups(files, edges, tail)
    rank = {g: i for i, g in enumerate(groups)}

    nodes = [
        {
            "id": m.name,
            "label": m.label,
            "dir": m.group,
            "group": m.group,
            "lines": m.lines,
            "kind": "file",
        }
        for m in sorted(files, key=lambda m: (rank.get(m.group, 0), m.rel))
    ]
    if externals:
        nodes += [
            {
                "id": "ext:" + name,
                "label": name,
                "dir": "third party",
                "group": EXTERNAL,
                "lines": 0,
                "kind": "external",
            }
            for name in sorted(ext_hits)
        ]
    nodes += [endpoints[k] for k in sorted(endpoints)]

    wires = [{"from": s, "to": d, "kind": k} for (s, d), k in sorted(edges.items())]
    used = sorted({w["kind"] for w in wires}, key=list(KINDS).index)

    pairs = [(w["from"], w["to"]) for w in wires]
    if layout == "folder":
        col, row, columns = place_by_folder(nodes, groups)
    else:
        col, row, columns = place_by_file(nodes, pairs, tail)
    for n in nodes:
        n["col"], n["row"] = col[n["id"]], row[n["id"]]

    graph = {
        "root": root.resolve().name,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "layout": layout,
        "groups": groups,
        "columns": columns,
        "kinds": {k: KINDS[k] for k in used},
        "nodes": nodes,
        "edges": wires,
        "externals_seen": dict(sorted(ext_hits.items(), key=lambda kv: (-kv[1], kv[0]))),
    }
    if decl is not None:
        graph["modules"] = module_views(root, graph, decl, hidden, source)
    return graph


def order_groups(files: list, edges: dict, tail: list) -> list[str]:
    """Left to right: whoever imports comes before whoever is imported.

    A topological sort of the folders. Cycles get broken by taking the folder
    with the fewest unmet dependents, then by name, so the result is stable.
    """
    group_of = {m.name: m.group for m in files}
    groups = sorted({m.group for m in files})

    deps: dict = {g: set() for g in groups}          # g imports these folders
    for (src, dst) in edges:
        a, b = group_of.get(src), group_of.get(dst)
        if a and b and a != b:
            deps[a].add(b)

    indeg = {g: 0 for g in groups}
    for g, ds in deps.items():
        for d in ds:
            indeg[d] += 1

    order: list[str] = []
    left = set(groups)
    while left:
        ready = sorted(g for g in left if indeg[g] == 0)
        if not ready:                                # a cycle; break it cheaply
            ready = [min(left, key=lambda g: (indeg[g], g))]
        for g in ready:
            if g not in left:
                continue
            order.append(g)
            left.discard(g)
            for d in deps[g]:
                if d in left:
                    indeg[d] -= 1

    return order + list(tail)


# -------------------------------------------------------------------- layout

MAXROWS = 12          # before a folder column splits in two (folder layout only)


def back_edges(ids: list, pairs: list) -> set:
    """The edges that close a loop, found by one depth-first walk.

    Dropping them leaves a graph with no cycles, which is all the layering
    needs. Iterative, so a deep codebase cannot blow the stack.
    """
    adj: dict = defaultdict(list)
    for src, dst in pairs:
        adj[src].append(dst)

    WHITE, GREY, BLACK = 0, 1, 2
    colour = {i: WHITE for i in ids}
    back: set = set()

    for root in ids:
        if colour[root] != WHITE:
            continue
        colour[root] = GREY
        stack = [(root, iter(adj[root]))]
        while stack:
            node, rest = stack[-1]
            went_deeper = False
            for nxt in rest:
                if nxt not in colour:
                    continue
                if colour[nxt] == GREY:
                    back.add((node, nxt))        # points back at an open node
                elif colour[nxt] == WHITE:
                    colour[nxt] = GREY
                    stack.append((nxt, iter(adj[nxt])))
                    went_deeper = True
                    break
            if not went_deeper:
                colour[node] = BLACK
                stack.pop()
    return back


def layer(ids: list, pairs: list) -> dict:
    """Give every file a column: one past the furthest thing that imports it.

    A file nothing imports starts at 0, so entry points line up on the left
    and every import wire then points rightward.
    """
    loops = back_edges(ids, pairs)
    alive = [(s, d) for s, d in pairs
             if (s, d) not in loops and s in set(ids) and d in set(ids)]

    nxt: dict = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for src, dst in alive:
        nxt[src].append(dst)
        indeg[dst] += 1

    col = {i: 0 for i in ids}
    queue = deque(i for i in ids if indeg[i] == 0)
    while queue:
        node = queue.popleft()
        for dst in nxt[node]:
            col[dst] = max(col[dst], col[node] + 1)
            indeg[dst] -= 1
            if indeg[dst] == 0:
                queue.append(dst)
    return col


def order_rows(columns: dict, pairs: list, sweeps: int = 4) -> dict:
    """Shuffle each column so the wires between them cross less.

    The usual barycentre heuristic: put a card level with the average of the
    cards it is wired to, one column at a time, back and forth.
    """
    before: dict = defaultdict(list)
    after: dict = defaultdict(list)
    for src, dst in pairs:
        after[src].append(dst)
        before[dst].append(src)

    tallest = max((len(v) for v in columns.values()), default=1)
    place: dict = {}

    def restack() -> None:
        for col, names in columns.items():
            pad = (tallest - len(names)) / 2.0      # columns sit centred
            for row, name in enumerate(names):
                place[name] = pad + row

    restack()
    keys = sorted(columns)
    for sweep in range(sweeps):
        run = keys[1:] if sweep % 2 == 0 else list(reversed(keys[:-1]))
        side = before if sweep % 2 == 0 else after
        for col in run:
            columns[col].sort(key=lambda n: (
                sum(place[m] for m in side[n] if m in place) / len(
                    [m for m in side[n] if m in place])
                if any(m in place for m in side[n]) else place[n]
            ))
            restack()

    return {n: row for col in columns for row, n in enumerate(columns[col])}


def place_by_file(nodes: list, pairs: list, pinned: list) -> tuple:
    """Lay out one card per file, by how deep in the import chain it sits."""
    loose = [n["id"] for n in nodes if n["group"] not in pinned]
    inner = [(s, d) for s, d in pairs if s in set(loose) and d in set(loose)]

    col = layer(loose, inner)
    depth = max(col.values(), default=0)

    # the cards that are not files go in columns of their own, at the end
    labels = {0: "entry points"}
    for extra, group in enumerate(pinned, start=1):
        for n in nodes:
            if n["group"] == group:
                col[n["id"]] = depth + extra
        labels[depth + extra] = group.strip("()")

    columns: dict = defaultdict(list)
    for n in nodes:
        columns[col[n["id"]]].append(n["id"])
    for c in columns:                       # a steady start for the sweeps
        order = {n["id"]: (n["group"], n["label"]) for n in nodes}
        columns[c].sort(key=lambda n: order[n])

    row = order_rows(columns, pairs)
    return mirror(col, row, [{"label": labels.get(c, "")} for c in sorted(columns)])


def mirror(col: dict, row: dict, labels: list) -> tuple:
    """Flip the columns end to end.

    The page draws a wire as flowing from what is imported into what imports
    it, so what is imported has to sit on the left for the wires to run
    rightward. Outside connections, where data comes from, end up first.
    """
    last = len(labels) - 1
    return {k: last - c for k, c in col.items()}, row, labels[::-1]


def place_by_folder(nodes: list, groups: list) -> tuple:
    """The older layout: one column per folder, split when a folder is tall."""
    col, row, labels = {}, {}, []
    index = 0
    for group in groups:
        members = [n for n in nodes if n["group"] == group]
        if not members:
            continue
        for start in range(0, len(members), MAXROWS):
            chunk = members[start:start + MAXROWS]
            for i, n in enumerate(chunk):
                col[n["id"]] = index
                row[n["id"]] = i
            labels.append({"label": group if start == 0 else ""})
            index += 1
    return mirror(col, row, labels)


# ---------------------------------------------------------------- front doors
#
# A declaration names the modules (sets of files) and, for each, the names
# outside code may use: its front door. The check reads every import back
# against it. CONTEXT.md has the words; the file looks like
#
#   {"modules": {"engine": {"files": ["atp/engine/*"], "front_door": ["Book"]}},
#    "tests":   {"files": ["tests/**"], "inside": {"tests/test_book.py": "engine"}}}

DECLARATION = "codegraph.json"
TEST_NAMES = ("test_*.py", "*_test.py", "conftest.py")
TEST_DIRS = ("tests", "test")


class DeclarationError(ValueError):
    """The declaration is malformed, so there is nothing to check against."""


@dataclass(frozen=True)
class Use:
    """One name a file takes from another file in the project."""
    target: str          # dotted name of the file the name comes from
    name: str | None     # None when it cannot be told which name
    line: int
    why: str = ""


@dataclass(frozen=True, order=True)
class Finding:
    rel: str
    line: int
    text: str

    def __str__(self) -> str:
        return (self.rel + (":" + str(self.line) if self.line else "")
                + "  " + self.text)


@dataclass
class Report:
    mismatches: list
    unknown: list


def path_match(rel: str, pattern: str) -> bool:
    """Match a path a folder at a time: `*` stays inside one folder, `**`
    spans any number of them. `atp/*` is atp's own files, not atp/engine's."""
    def walk(parts: list, pats: list) -> bool:
        if not pats:
            return not parts
        if pats[0] == "**":
            return any(walk(parts[i:], pats[1:]) for i in range(len(parts) + 1))
        return bool(parts) and fnmatchcase(parts[0], pats[0]) and walk(parts[1:], pats[1:])
    return walk(rel.split("/"), pattern.split("/"))


def _any_match(rel: str, patterns: list) -> bool:
    return any(path_match(rel, p) for p in patterns)


def read_uses(path: Path, package: str, index: dict) -> list:
    """Every name this file takes from another file in the index.

    `from a.b import X` uses X. A file bound as a whole (`import a.b as m`,
    `from a import b`) uses whatever is read off it: `m.X` uses X. A file
    bound whole and then passed around, or `import *`, is a use that cannot
    be told, and says so rather than guess.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except (OSError, SyntaxError, ValueError):
        return []

    uses: list = []
    bound: dict = {}                     # local name -> dotted path it stands for

    def longest(dotted: str):
        parts = dotted.split(".")
        for i in range(len(parts), 0, -1):
            head = ".".join(parts[:i])
            if head in index:
                return head, parts[i:]
        return None, parts

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    bound[alias.asname] = alias.name
                else:
                    top = alias.name.split(".")[0]
                    bound[top] = top
        elif isinstance(node, ast.ImportFrom):
            target = absolute(RawImport(node.module, (), node.level or 0, False), package)
            if not target:
                continue
            # a folder of loose scripts: `from helpers import x` is next door
            if package and not any(k == target or k.startswith(target + ".")
                                   for k in index):
                target = package + "." + target
            for alias in node.names:
                sub = target + "." + alias.name
                if alias.name == "*":
                    if target in index:
                        uses.append(Use(target, None, node.lineno, "import *"))
                elif sub in index:
                    bound[alias.asname or alias.name] = sub
                elif target in index:
                    uses.append(Use(target, alias.name, node.lineno))

    # names read off a file bound whole: take the outermost a.b.c of a chain
    inner = {id(n.value) for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
    for node in ast.walk(tree):
        if id(node) in inner:
            continue
        if isinstance(node, ast.Attribute):
            dotted = dotted_name(node)
            head, _, rest = dotted.partition(".")
            if head not in bound:
                continue
            found, tail = longest(bound[head] + "." + rest)
            if found:
                uses.append(Use(found, tail[0], node.lineno) if tail else
                            Use(found, None, node.lineno, "a module passed whole"))
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) \
                and bound.get(node.id) in index:
            uses.append(Use(bound[node.id], None, node.lineno, "a module passed whole"))
    return uses


def _strs(value) -> bool:
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def validate(decl) -> None:
    """Refuse a declaration that cannot mean anything, and say why."""
    if not isinstance(decl, dict):
        raise DeclarationError("the declaration must be a JSON object")
    mods = decl.get("modules")
    if not isinstance(mods, dict) or not mods:
        raise DeclarationError('the declaration needs "modules", naming at least one')
    for name, m in mods.items():
        if not isinstance(m, dict) or not _strs(m.get("files")):
            raise DeclarationError('module "{}" needs "files": a list of path patterns'
                                   .format(name))
        if not _strs(m.get("front_door", [])):
            raise DeclarationError('module "{}": "front_door" must be a list of names'
                                   .format(name))
    tests = decl.get("tests", {})
    if not isinstance(tests, dict) or not _strs(tests.get("files", [])):
        raise DeclarationError('"tests" needs "files": a list of path patterns')
    for rel, home in tests.get("inside", {}).items():
        if home not in mods:
            raise DeclarationError('test {} is declared inside "{}", which is not a module'
                                   .format(rel, home))


def _sorted(findings: list) -> list:
    return sorted(set(findings))


@dataclass(frozen=True)
class Crossing:
    """One name one module takes from another."""
    src: str             # dotted name of the file that uses it
    dst: str             # dotted name of the file it comes from
    there: str           # the module it comes from
    name: str
    ok: bool             # on that module's front door


@dataclass
class Reading:
    """The code, read against a declaration. The check and the page's module
    views both start here, so they cannot disagree."""
    files: list
    owner: dict          # file -> module; a test declared inside one counts
    tests: set
    mismatches: list
    unknown: list
    crossings: list


def read_against(root: Path, decl: dict, hidden: bool = False) -> Reading:
    validate(decl)
    mods = decl["modules"]
    tests = decl.get("tests", {})
    test_pats, inside = tests.get("files", []), tests.get("inside", {})
    door = {n: set(m.get("front_door", [])) for n, m in mods.items()}

    files = [file_of(p, root) for p in discover(root, hidden)]
    index = {f.name: f for f in files}
    mismatches: list = []
    unknown: list = []
    crossings: list = []

    is_test = {f.name for f in files if _any_match(f.rel, test_pats)}
    owner: dict = {}
    claimed: dict = defaultdict(int)
    for f in files:
        if f.name in is_test:
            if f.rel in inside:
                owner[f.name] = inside[f.rel]
            continue
        homes = [n for n, m in mods.items() if _any_match(f.rel, m["files"])]
        for n in homes:
            claimed[n] += 1
        if len(homes) == 1:
            owner[f.name] = homes[0]
        elif not homes:
            mismatches.append(Finding(f.rel, 0, "is in no module"))
        else:
            mismatches.append(Finding(f.rel, 0, "is in more than one module: "
                                      + ", ".join(homes)))
    for n in mods:
        if not claimed[n]:
            mismatches.append(Finding(DECLARATION, 0,
                                      'module "{}" matches no files'.format(n)))

    for f in files:
        here = owner.get(f.name)
        for u in read_uses(f.path, f.package, index):
            if u.target in is_test and f.name not in is_test:
                mismatches.append(Finding(f.rel, u.line, "imports a test, "
                                          + index[u.target].rel))
                continue
            there = owner.get(u.target)
            if there is None or there == here or u.target in is_test:
                continue
            if u.name is None:
                unknown.append(Finding(f.rel, u.line, "uses {} in a way that cannot be "
                                       "read ({})".format(there, u.why)))
                continue
            ok = u.name in door[there]
            crossings.append(Crossing(f.name, u.target, there, u.name, ok))
            if not ok:
                mismatches.append(Finding(f.rel, u.line, "uses {} from {}, which is not "
                                          "on its front door".format(u.name, there)))

    return Reading(files, owner, is_test, _sorted(mismatches), _sorted(unknown),
                   crossings)


def check(root: Path, decl: dict, hidden: bool = False) -> Report:
    """Read the code back against a declaration.

    Every program file belongs to exactly one module. Every name one module
    takes from another is on that module's front door. A test is an outside
    caller, unless declared inside one module, and the program never imports
    a test.
    """
    r = read_against(root, decl, hidden)
    return Report(r.mismatches, r.unknown)


# ------------------------------------------------------------- module views
#
# The page's second level: one card per module, wires between them carrying
# the names that cross, and for each module a view of its own files beside the
# modules and outside connections they touch.

TESTS_CARD, LOOSE_CARD = "(tests)", "(no module)"


def module_views(root: Path, graph: dict, decl: dict, hidden: bool = False,
                 source: str = "declared") -> dict:
    r = read_against(root, decl, hidden)
    mods = decl["modules"]
    shown = {n["id"]: n for n in graph["nodes"]}
    is_file = {f.name for f in r.files}

    def card(fid: str) -> str:
        if fid not in is_file:
            return fid                                  # outside or third party
        if fid in r.owner:
            return "mod:" + r.owner[fid]
        return "mod:" + (TESTS_CARD if fid in r.tests else LOOSE_CARD)

    members: dict = defaultdict(list)
    for n in graph["nodes"]:
        if n["kind"] == "file":
            members[card(n["id"])].append(n["id"])

    cards = {}
    for cid, ids in members.items():
        name = cid[4:]
        cards[cid] = {
            "id": cid, "label": name.strip("()"),
            "dir": "1 file" if len(ids) == 1 else "{} files".format(len(ids)),
            "group": name, "lines": sum(shown[i]["lines"] for i in ids),
            "kind": "module", "files": sorted(ids),
            "door": sorted(mods.get(name, {}).get("front_door", [])),
        }

    def view(title: str, unit: str, own: list, mapping) -> dict:
        """Lift the file graph through `mapping`, keep the wires that touch
        `own`, and lay out what is left."""
        wires: dict = {}
        for e in graph["edges"]:
            a, b = mapping(e["from"]), mapping(e["to"])
            if a == b or not (a in own or b in own):
                continue
            wiring = e["kind"] in ("import", "lazy")
            key = (a, b, "import" if wiring else e["kind"])
            w = wires.setdefault(key, {"from": a, "to": b, "kind": e["kind"],
                                       "names": set(), "bad": set(), "via": set()})
            if w["kind"] == "lazy" and e["kind"] == "import":
                w["kind"] = "import"      # a real import beats one in a function
            if a != e["from"]:
                w["via"].add(e["from"])   # the files on a card this wire comes from
        for c in r.crossings:
            w = wires.get((mapping(c.src), mapping(c.dst), "import"))
            if w:
                w["names"].add(c.name)
                if not c.ok:
                    w["bad"].add(c.name)
        edges = [dict(w, names=sorted(w["names"]), bad=sorted(w["bad"]),
                      via=sorted(w["via"]))
                 for _, w in sorted(wires.items())]

        ids = list(dict.fromkeys(own + [x for w in edges for x in (w["from"], w["to"])]))
        nodes = [dict(cards.get(i) or shown[i]) for i in ids]
        tail = [g for g in (EXTERNAL, OUTSIDE) if any(n["group"] == g for n in nodes)]
        col, row, columns = place_by_file(nodes, [(w["from"], w["to"]) for w in edges], tail)
        for n in nodes:
            n["col"], n["row"] = col[n["id"]], row[n["id"]]
        groups = list(dict.fromkeys(n["group"] for n in nodes if n["group"] not in tail))
        return {"title": title, "unit": unit, "nodes": nodes, "edges": edges,
                "columns": columns, "groups": groups + tail}

    views = {"modules": view("Modules", "modules", sorted(cards), card)}
    for cid, c in cards.items():
        own = c["files"]
        views[cid] = view(c["label"], "cards", own,
                          lambda fid, own=set(own): fid if fid in own else card(fid))

    return {"source": source, "views": views,
            "mismatches": [str(m) for m in r.mismatches],
            "unknown": [str(u) for u in r.unknown]}


def looks_like_test(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in TEST_DIRS for p in parts[:-1]) or \
        any(fnmatchcase(parts[-1], p) for p in TEST_NAMES)


def draft(root: Path, hidden: bool = False) -> dict:
    """A first declaration, made from what the code does today.

    One module per folder. Each front door holds the names the program
    already takes from that folder, so the program passes at once. Tests are
    found by their names and left outside every module, so any test that
    reaches past a front door shows up straight away.
    """
    files = [file_of(p, root) for p in discover(root, hidden)]
    index = {f.name: f for f in files}

    tests, program = [], []
    for f in files:
        (tests if looks_like_test(f.rel) else program).append(f)

    groups = sorted({f.group for f in program})
    lasts = defaultdict(int)
    for g in groups:
        lasts[g.split("/")[-1]] += 1

    def name_of(group: str) -> str:
        if group == ".":
            return root.resolve().name
        last = group.split("/")[-1]
        return last if lasts[last] == 1 else group.replace("/", ".")

    owner = {f.name: name_of(f.group) for f in program}
    door: dict = defaultdict(set)
    for f in program:
        for u in read_uses(f.path, f.package, index):
            there = owner.get(u.target)
            if there and there != owner[f.name] and u.name:
                door[there].add(u.name)

    modules = {}
    for g in groups:
        n = name_of(g)
        modules[n] = {"files": ["*.py" if g == "." else g + "/*"],
                      "front_door": sorted(door[n])}

    test_pats = set()
    for f in tests:
        parts = f.rel.split("/")
        cut = next((i for i, p in enumerate(parts[:-1]) if p in TEST_DIRS), None)
        test_pats.add("/".join(parts[:cut + 1]) + "/**" if cut is not None else f.rel)

    return {"modules": dict(sorted(modules.items())),
            "tests": {"files": sorted(test_pats)}}


# -------------------------------------------------------------------- render

def render(graph: dict) -> str:
    html = TEMPLATE.read_text(encoding="utf-8")
    if "/*__GRAPH__*/null" not in html:
        raise SystemExit(str(TEMPLATE) + " has no /*__GRAPH__*/null placeholder")
    return html.replace("/*__GRAPH__*/null", json.dumps(graph, indent=1))


def nodes_by_id(graph: dict) -> dict:
    return {n["id"]: n for n in graph["nodes"]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="codegraph",
        description="Draw a Python codebase as cards and wires, from its imports.",
    )
    ap.add_argument("root", type=Path, help="folder to read")
    ap.add_argument("-o", "--out", type=Path, default=Path("codegraph.html"),
                    help="where to write the page (default: codegraph.html)")
    ap.add_argument("--json", action="store_true", help="print the data, write no page")
    ap.add_argument("--externals", action="store_true",
                    help="give third-party packages their own cards")
    ap.add_argument("--hidden", action="store_true",
                    help="read dotted folders too (.claude, .github ...)")
    ap.add_argument("--no-outside", dest="outside", action="store_false",
                    help="imports only; skip the hunt for outside connections")
    ap.add_argument("--layout", choices=("file", "folder"), default="file",
                    help="columns by import depth (default) or one per folder")
    ap.add_argument("--keep-empty", action="store_true",
                    help="keep empty __init__.py files that nothing imports")
    ap.add_argument("--check", action="store_true",
                    help="read the code against the declaration; exit 1 on a mismatch")
    ap.add_argument("--draft", action="store_true",
                    help="write a first declaration from what the code does today")
    ap.add_argument("--declaration", type=Path, metavar="FILE",
                    help="the declaration to use (default: ROOT/" + DECLARATION + ")")
    args = ap.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        ap.error(str(root) + " is not a folder")

    decl_path = args.declaration or root / DECLARATION
    if args.draft:
        if decl_path.exists():
            ap.error(str(decl_path) + " already exists; move it aside to draft afresh")
        decl = draft(root, hidden=args.hidden)
        decl_path.write_text(json.dumps(decl, indent=2) + "\n", encoding="utf-8")
        names = sum(len(m["front_door"]) for m in decl["modules"].values())
        print("{} modules, {} names on their front doors -> {}".format(
            len(decl["modules"]), names, decl_path))
        print("Every front door holds what crosses today. Narrow them to what "
              "should cross, then run --check.")
        return 0
    if args.check:
        try:
            decl = json.loads(decl_path.read_text(encoding="utf-8"))
            report = check(root, decl, hidden=args.hidden)
        except FileNotFoundError:
            ap.error("no declaration at {}; make one with --draft".format(decl_path))
        except json.JSONDecodeError as e:
            ap.error("{} is not valid JSON: {}".format(decl_path, e))
        except DeclarationError as e:
            ap.error("{}: {}".format(decl_path, e))
        for m in report.mismatches:
            print(m)
        if report.unknown:
            print("cannot tell:")
            for u in report.unknown:
                print("    " + str(u))
        print("{} mismatches, {} cannot tell".format(
            len(report.mismatches), len(report.unknown)))
        return 1 if report.mismatches else 0

    # The page's module views come from the declaration, or failing that from
    # a draft, which the page labels as a draft.
    source = "declared"
    try:
        decl = json.loads(decl_path.read_text(encoding="utf-8"))
        validate(decl)
    except FileNotFoundError:
        decl, source = draft(root, hidden=args.hidden), "draft"
    except (json.JSONDecodeError, DeclarationError) as e:
        print("{}: {}; module views left out".format(decl_path, e))
        decl = None

    graph = build(root, externals=args.externals, hidden=args.hidden,
                  outside=args.outside, layout=args.layout,
                  keep_empty=args.keep_empty, decl=decl, source=source)

    if args.json:
        print(json.dumps(graph, indent=2))
        return 0

    args.out.write_text(render(graph), encoding="utf-8")

    nfiles = sum(1 for n in graph["nodes"] if n["kind"] == "file")
    lazy = sum(1 for e in graph["edges"] if e["kind"] == "lazy")
    print(
        "{} files, {} wires ({} of them imports inside a function), "
        "{} folders -> {}".format(
            nfiles, len(graph["edges"]), lazy, len(graph["groups"]), args.out
        )
    )
    if args.layout == "file":
        cols = [n["col"] for n in graph["nodes"] if n["kind"] == "file"] or [0]
        deep = max(cols) - min(cols)
        back = sum(1 for e in graph["edges"]
                   if e["kind"] in ("import", "lazy")
                   and nodes_by_id(graph)[e["to"]]["col"]
                   >= nodes_by_id(graph)[e["from"]]["col"])
        print("{} columns deep{}".format(
            deep + 1,
            "" if not back else "; {} wires point back (a loop)".format(back)))

    outs = [n for n in graph["nodes"] if n["kind"] == "outside"]
    if outs:
        by_kind: dict = defaultdict(set)
        for e in graph["edges"]:
            if e["kind"] in KINDS and e["kind"] not in ("import", "lazy"):
                by_kind[e["kind"]].add(e["to"])
        print("reaches outside: " + ", ".join(
            "{} {}".format(len(v), KINDS[k]["label"]) for k, v in
            sorted(by_kind.items(), key=lambda kv: -len(kv[1]))
        ))
        for n in sorted(outs, key=lambda n: n["label"]):
            print("    {:<26} {}".format(n["label"], n["dir"]))

    mv = graph.get("modules")
    if mv:
        print("{} modules ({}), {} off a front door".format(
            sum(1 for n in mv["views"]["modules"]["nodes"] if n["kind"] == "module"),
            "from " + decl_path.name if source == "declared" else "drafted from folders",
            len(mv["mismatches"])))

    seen = list(graph["externals_seen"])[:6]
    if seen:
        more = "" if args.externals else "   (--externals draws these too)"
        print("third party seen: " + ", ".join(seen) + more)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
