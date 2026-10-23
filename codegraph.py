#!/usr/bin/env python3
"""codegraph - turn a Python codebase into a card-and-wire graph.

Point it at a folder. It parses every .py file with the ast module, works out
which imports land back inside that folder, and writes a standalone HTML page
you can open in a browser. No third-party packages, no model in the loop.

    python codegraph.py ../..                  # -> codegraph.html
    python codegraph.py ../.. -o graph.html
    python codegraph.py ../.. --json           # the data, nothing else
    python codegraph.py ../.. --externals      # third-party packages as cards too

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
          keep_empty: bool = False) -> dict:
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

    return {
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
    return col, row, [{"label": labels.get(c, "")} for c in sorted(columns)]


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
    return col, row, labels


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
    args = ap.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        ap.error(str(root) + " is not a folder")

    graph = build(root, externals=args.externals, hidden=args.hidden,
                  outside=args.outside, layout=args.layout,
                  keep_empty=args.keep_empty)

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
        deep = max((n["col"] for n in graph["nodes"] if n["kind"] == "file"),
                   default=0)
        back = sum(1 for e in graph["edges"]
                   if e["kind"] in ("import", "lazy")
                   and nodes_by_id(graph)[e["to"]]["col"]
                   <= nodes_by_id(graph)[e["from"]]["col"])
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

    seen = list(graph["externals_seen"])[:6]
    if seen:
        more = "" if args.externals else "   (--externals draws these too)"
        print("third party seen: " + ", ".join(seen) + more)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
