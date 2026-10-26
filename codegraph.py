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
from dataclasses import dataclass, field
from datetime import datetime, timezone
from fnmatch import fnmatchcase
from pathlib import Path
from urllib.parse import urlsplit

import shapes

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
    # the map's own wires, between what files belong to (CONTEXT.md, Wires).
    # head says where the arrowhead sits: where information arrives.
    "uses":     {"label": "uses", "hue": 150, "dash": "", "width": 1.6, "head": "both"},
    "informed": {"label": "informed by", "hue": 200, "dash": "", "width": 1.3, "head": "from"},
    "acts":     {"label": "acts on", "hue": 285, "dash": "", "width": 1.6, "head": "both"},
    "contains": {"label": "contains", "hue": 305, "dash": "2 3", "width": 1.2, "head": "to"},
    "starts":   {"label": "starts", "hue": 45, "dash": "", "width": 1.6, "head": "to"},
    "writes":   {"label": "writes", "hue": 180, "dash": "", "width": 1.8, "head": "to"},
    "reads":    {"label": "reads", "hue": 180, "dash": "4 3", "width": 1.4, "head": "from"},
    "leads":    {"label": "leads to", "hue": 330, "dash": "", "width": 1.5, "head": "to"},
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
    """One source file, and the name other files would import it by."""
    name: str          # atp.engine.tick, or src/lib/calendar.ts
    path: Path
    rel: str           # atp/engine/tick.py
    group: str         # atp/engine  (the folder it sits in)
    package: str       # atp.engine  (what a relative import counts from)
    lines: int
    lang: str = "python"   # which reader made it

    @property
    def label(self) -> str:
        return self.path.name


# ----------------------------------------------------------------- discovery

def discover(root: Path, hidden: bool = False,
             suffixes: tuple = (".py",)) -> list[Path]:
    """Every source file under root with one of these endings, minus the
    usual noise.

    Dotted folders are skipped unless asked for: a folder whose name starts
    with a dot cannot be imported, so anything in one is tooling, not code the
    project runs.
    """
    found: list[Path] = []
    for path in sorted(p for p in root.rglob("*") if p.suffix in suffixes and p.is_file()):
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


ENVIRONMENT = Conn("env", "env:environment", "environment", "environment variables")


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


def match_probe(name: str, probes: tuple = PROBES):
    for pattern, kind, service in probes:
        if fnmatchcase(name, pattern):
            return kind, service
    return None


def urls_from(strings) -> list:
    """Every URL written in these strings, scheme and host pulled apart."""
    found = []
    for text in strings:
        for raw in URL_RE.findall(text):
            bits = urlsplit(raw.rstrip(".,);"))
            # a port filled in later, `http://host:${port}`, leaves a bare colon
            host = bits.netloc.split("@")[-1].rstrip(":")
            if not host:
                continue
            found.append((bits.scheme.lower(), host, bits.path or "/"))
    return found


def urls_in(tree: ast.AST) -> list:
    """Every URL written as a string literal in a Python file."""
    return urls_from(n.value for n in ast.walk(tree)
                     if isinstance(n, ast.Constant) and isinstance(n.value, str))


def read_outside(path: Path) -> list:
    """What this one Python file appears to reach outside the process.

    Two kinds of evidence, both syntactic: a call that matches the probe
    table, and a URL written as a string. Neither is run.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except (OSError, SyntaxError, ValueError):
        return []

    syms = symbol_table(tree)
    calls = [through_imports(dotted_name(n.func), syms)
             for n in ast.walk(tree) if isinstance(n, ast.Call)]
    # os.environ["KEY"] is a subscript, not a call
    env = any(isinstance(n, ast.Subscript) and
              through_imports(dotted_name(n.value), syms) == "os.environ"
              for n in ast.walk(tree))
    return connections(calls, urls_in(tree), env, PROBES)


def connections(calls: list, urls: list, env: bool, probes: tuple) -> list:
    """Turn what a file calls, the URLs it writes down and whether it reads
    the environment into its outside connections. The same for every
    language; only the probe table differs."""
    conns: dict = {}

    def keep(conn: Conn) -> None:
        conns.setdefault(conn.target, conn)

    # Calls first. A library says what sort of connection this is, which is
    # worth more than the scheme on a URL: feedparser.parse("https://...") is
    # a feed, not a plain HTTP call.
    loose: list = []
    for name in calls:
        hit = match_probe(name, probes)
        if not hit:
            continue
        kind, service = hit
        if kind == "env":
            keep(ENVIRONMENT)             # however it was reached, it is one card
        elif service:
            keep(Conn(kind, "svc:" + service, service, KINDS[kind]["label"]))
        else:
            loose.append((kind, name))
    if env:
        keep(ENVIRONMENT)

    # Does one library in this file say what its URLs are for?
    speaks = {k for k, _ in loose if k in ("feed", "market", "database", "queue", "cloud")}
    house = speaks.pop() if len(speaks) == 1 else None

    hosts: set = set()
    for scheme, host, route in urls:
        # an unknown scheme, obsidian:// or slack://, opens an app, not a host
        kind = SCHEME_KIND.get(scheme)
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


# ------------------------------------------------------------------- readers
#
# Everything that depends on the language a file is written in sits behind a
# reader. A reader turns a file into its name, the imports it makes, the
# names it takes from other files and the connections it makes outside. The
# rest of codegraph works on files, names and wires, whatever the language.

@dataclass(frozen=True)
class Link:
    """One import: the file in the codebase it lands on, or failing that the
    third-party package it reaches instead."""
    target: str | None     # a file's name in the index
    package: str | None    # a third-party package, when target is None
    nested: bool           # written inside a function


class PythonReader:
    lang = "python"
    suffixes = (".py",)
    stdlib = getattr(sys, "stdlib_module_names", frozenset())

    def file_of(self, path: Path, root: Path) -> File:
        return file_of(path, root)

    def links(self, f: File, index: dict) -> list:
        out: list = []
        for imp in read_imports(f.path):
            target = absolute(imp, f.package)
            hits = resolve(target, imp.names, index, f.package)
            if hits:
                out += [Link(h, None, imp.nested) for h in hits]
                continue
            top = target.split(".")[0]
            if top and top not in self.stdlib and top != "__future__":
                out.append(Link(None, top, imp.nested))
        return out

    def uses(self, f: File, index: dict) -> list:
        return read_uses(f.path, f.package, index)

    def outside(self, f: File) -> list:
        return read_outside(f.path)


# ---------------------------------------------------- TypeScript, JavaScript
#
# tree-sitter does the parsing (docs/adr/0001). What an import lands on is
# ours: relative paths with or without an ending, a folder's index file, a
# .js ending standing for the .ts on disk, tsconfig "paths" shortcuts, and
# packages in the same repository named in their package.json.

NODE_BUILTINS = frozenset("""
    assert async_hooks buffer child_process cluster console constants crypto dgram
    diagnostics_channel dns domain events fs fs/promises http http2 https inspector
    module net os path path/posix path/win32 perf_hooks process punycode querystring
    readline repl stream stream/promises string_decoder sys timers timers/promises
    tls trace_events tty url util v8 vm wasi worker_threads zlib test
""".split())

SCRIPT_ENDINGS = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
# an import written with the ending the compiler will emit stands for these
EMITTED_AS = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}

SCRIPT_PROBES = (
    ("fetch",                         "http", None),
    ("axios",                         "http", None),
    ("axios.*",                       "http", None),
    ("node-fetch",                    "http", None),
    ("got",                           "http", None),
    ("got.*",                         "http", None),
    ("http.request", "http", None), ("http.get", "http", None),
    ("https.request", "http", None), ("https.get", "http", None),
    ("@anthropic-ai/sdk*",            "http", "anthropic"),
    ("openai*",                       "http", "openai"),

    ("http.createServer",             "serves", None),
    ("https.createServer",            "serves", None),
    ("express",                       "serves", None),
    ("fastify",                       "serves", None),
    ("hono*",                         "serves", None),

    ("firebase-admin*",               "database", "firestore"),
    ("firebase/firestore*",           "database", "firestore"),
    ("pg.*",                          "database", "postgres"),
    ("postgres",                      "database", "postgres"),
    ("mysql2*",                       "database", "mysql"),
    ("mongodb.*",                     "database", "mongodb"),
    ("mongoose.*",                    "database", "mongodb"),
    ("redis.*",                       "database", "redis"),
    ("ioredis",                       "database", "redis"),
    ("better-sqlite3",                "database", "sqlite"),
    ("sqlite3.*",                     "database", "sqlite"),
    ("@prisma/client*",               "database", None),

    ("@aws-sdk/*",                    "cloud", "aws"),
    ("@google-cloud/*",               "cloud", "google cloud"),

    ("child_process.*",               "process", None),
    ("execa*",                        "process", None),
)


def loose_json(text: str):
    """Parse JSON the way tsconfig writes it: comments and trailing commas."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':                                  # copy a string whole
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(text[i:j + 1]); i = j + 1
        elif text.startswith("//", i):
            i = text.find("\n", i) if "\n" in text[i:] else n
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c); i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


def package_name(spec: str) -> str:
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


class ScriptReader:
    """TypeScript and JavaScript, read with tree-sitter."""
    lang = "script"
    suffixes = SCRIPT_ENDINGS

    def __init__(self):
        import tree_sitter as ts
        import tree_sitter_javascript as tsj
        import tree_sitter_typescript as tst
        typescript = ts.Language(tst.language_typescript())
        tsx = ts.Language(tst.language_tsx())
        javascript = ts.Language(tsj.language())
        self.parsers = {s: ts.Parser(lang) for s, lang in (
            (".ts", typescript), (".mts", typescript), (".cts", typescript),
            (".tsx", tsx), (".js", javascript), (".jsx", javascript),
            (".mjs", javascript), (".cjs", javascript))}
        self._facts: dict = {}
        self._configs: dict = {}
        self._workspaces: dict = {}

    def file_of(self, path: Path, root: Path) -> File:
        rel = path.relative_to(root).as_posix()
        folder = rel.rsplit("/", 1)[0] if "/" in rel else ""
        return File(name=rel, path=path, rel=rel, group=folder or ".", package=folder,
                    lines=_count_lines(path), lang=self.lang)

    # -------------------------------------------------------------- reading
    def facts(self, f: File) -> dict:
        """Everything this reader needs from one file, read once."""
        if f.path in self._facts:
            return self._facts[f.path]
        try:
            src = f.path.read_bytes()
        except OSError:
            src = b""
        tree = self.parsers[f.path.suffix].parse(src)
        facts = {"imports": [], "uses": [], "calls": [], "strings": [], "env": False}
        bound: dict = {}           # local name -> (spec, name or None for the whole)
        whole: dict = {}           # local name -> spec, for a module bound whole
        text = lambda n: n.text.decode("utf-8", "replace")

        def spec_of(node) -> str | None:
            if node is None or node.type != "string":
                return None
            frag = [c for c in node.children if c.type == "string_fragment"]
            return text(frag[0]) if frag else ""

        def dotted(node) -> str:
            parts = []
            while node is not None and node.type == "member_expression":
                parts.append(text(node.child_by_field_name("property")))
                node = node.child_by_field_name("object")
            if node is None or node.type not in ("identifier", "this"):
                return ""
            parts.append(text(node))
            return ".".join(reversed(parts))

        def imported(stmt, spec, nested):
            facts["imports"].append((spec, nested))
            clause = next((c for c in stmt.children if c.type == "import_clause"), None)
            for c in clause.children if clause else []:
                if c.type == "identifier":                    # import X from
                    bound[text(c)] = (spec, "default")
                    facts["uses"].append((spec, "default", c.start_point[0] + 1))
                elif c.type == "namespace_import":            # import * as X
                    name = next(x for x in c.children if x.type == "identifier")
                    whole[text(name)] = spec
                elif c.type == "named_imports":               # import { a, b as c }
                    for s in c.children:
                        if s.type != "import_specifier":
                            continue
                        name = text(s.child_by_field_name("name"))
                        alias = s.child_by_field_name("alias")
                        bound[text(alias) if alias else name] = (spec, name)
                        facts["uses"].append((spec, name, s.start_point[0] + 1))

        def walk(node, nested):
            t = node.type
            if t == "import_statement":
                spec = spec_of(node.child_by_field_name("source"))
                if spec is not None:
                    imported(node, spec, nested)
                return
            if t == "export_statement":
                spec = spec_of(node.child_by_field_name("source"))
                if spec is not None:                          # export ... from
                    facts["imports"].append((spec, nested))
                    for c in node.children:
                        if c.type == "export_clause":
                            for s in c.children:
                                if s.type == "export_specifier":
                                    facts["uses"].append((spec, text(s.child_by_field_name("name")),
                                                          s.start_point[0] + 1))
                    return
            if t in ("call_expression", "new_expression"):
                fn = node.child_by_field_name("function" if t == "call_expression" else "constructor")
                args = node.child_by_field_name("arguments")
                first = next((a for a in args.children if a.is_named), None) if args else None
                if fn is not None and fn.type == "import":            # import("./x")
                    spec = spec_of(first)
                    if spec is not None:
                        facts["imports"].append((spec, True))
                elif fn is not None and fn.type == "identifier" and text(fn) == "require":
                    spec = spec_of(first)
                    if spec is not None:
                        facts["imports"].append((spec, nested))
                        holder = node.parent
                        if holder is not None and holder.type == "variable_declarator":
                            name = holder.child_by_field_name("name")
                            if name is not None and name.type == "identifier":
                                whole[text(name)] = spec
                            elif name is not None and name.type == "object_pattern":
                                for p in name.children:
                                    key = p.child_by_field_name("key") if p.type == "pair_pattern" else p
                                    if key is not None and key.type in (
                                            "shorthand_property_identifier_pattern",
                                            "property_identifier"):
                                        facts["uses"].append((spec, text(key), p.start_point[0] + 1))
                elif fn is not None:
                    facts["calls"].append(dotted(fn))
            if t == "member_expression":
                name = dotted(node)
                if name.startswith("process.env"):
                    facts["env"] = True
                head = name.split(".")[0]
                if head in whole and (node.parent is None or node.parent.type != "member_expression"
                                      or node.parent.child_by_field_name("object") != node):
                    rest = name.split(".")[1:]
                    facts["uses"].append((whole[head], rest[0] if rest else None,
                                          node.start_point[0] + 1))
            if t == "identifier" and text(node) in whole and node.parent is not None and not (
                    node.parent.type == "member_expression"
                    and node.parent.child_by_field_name("object") == node) and \
                    node.parent.type not in ("namespace_import", "variable_declarator"):
                facts["uses"].append((whole[text(node)], None, node.start_point[0] + 1))
            if t in ("string_fragment",):
                facts["strings"].append(text(node))
            deeper = nested or t in ("function_declaration", "function_expression", "arrow_function",
                                     "method_definition", "generator_function_declaration")
            for c in node.children:
                walk(c, deeper)

        walk(tree.root_node, False)
        # a call written through an import means the library: spawn() is
        # child_process.spawn, new Anthropic() is @anthropic-ai/sdk
        def through(name: str) -> str:
            head, _, tail = name.partition(".")
            if head in whole:
                lib = whole[head]
            elif head in bound:
                spec, member = bound[head]
                lib = spec if member == "default" else spec + "." + member
            else:
                return name
            lib = lib[5:] if lib.startswith("node:") else lib
            return lib + ("." + tail if tail else "")
        facts["calls"] = [through(c) for c in facts["calls"] if c]
        self._facts[f.path] = facts
        return facts

    # ------------------------------------------------------------ resolving
    def root_of(self, f: File) -> Path:
        return f.path.parents[f.rel.count("/")]

    def config_for(self, f: File, root: Path) -> list:
        """The tsconfig "paths" in force for this file: (pattern, targets,
        base folder) from the nearest tsconfig.json, following "extends"."""
        here = f.path.parent
        while True:
            if here in self._configs:
                return self._configs[here]
            cfg = here / "tsconfig.json"
            if cfg.is_file():
                self._configs[here] = self.read_config(cfg, root, set())
                return self._configs[here]
            if here == root or here.parent == here:
                return []
            here = here.parent

    def read_config(self, cfg: Path, root: Path, seen: set) -> list:
        if cfg in seen:
            return []
        seen.add(cfg)
        try:
            data = loose_json(cfg.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        opts = data.get("compilerOptions", {}) or {}
        base = cfg.parent / opts.get("baseUrl", ".")
        rules = [(k, v, base) for k, v in (opts.get("paths") or {}).items()]
        if not rules and "baseUrl" in opts:
            rules = [("*", ["*"], base)]
        parent = data.get("extends")
        if isinstance(parent, str) and parent.startswith("."):
            more = cfg.parent / parent
            more = more if more.suffix == ".json" else more.with_suffix(".json")
            rules += self.read_config(more, root, seen)
        return rules

    def workspaces(self, root: Path) -> dict:
        """Packages in this repository, by the name in their package.json."""
        if root not in self._workspaces:
            found = {}
            for pj in root.rglob("package.json"):
                parts = pj.relative_to(root).parts[:-1]
                if any(p in SKIP_DIRS or p.startswith(".") for p in parts):
                    continue
                try:
                    data = json.loads(pj.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if isinstance(data.get("name"), str):
                    found[data["name"]] = (pj.parent, data)
            self._workspaces[root] = found
        return self._workspaces[root]

    def find(self, path: Path, root: Path, index: dict) -> str | None:
        """The file in the index this path stands for, trying the endings
        and index files an import may leave out."""
        try:
            rel = path.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            return None                                  # outside the codebase
        tries = [rel]
        stem, dot, end = rel.rpartition(".")
        if dot and "." + end in EMITTED_AS:
            tries += [stem + e for e in EMITTED_AS["." + end]]
        tries += [rel + e for e in SCRIPT_ENDINGS]
        tries += [rel + "/index" + e for e in SCRIPT_ENDINGS]
        return next((t for t in tries if t in index), None)

    def land(self, spec: str, f: File, index: dict):
        """Where an import lands: ("file", name), ("package", name) or None
        for Node's own modules and anything that cannot be placed."""
        root = self.root_of(f)
        if spec.startswith("node:") or spec in NODE_BUILTINS:
            return None
        if spec.startswith("."):
            hit = self.find(f.path.parent / spec, root, index)
            return ("file", hit) if hit else None
        for pattern, targets, base in self.config_for(f, root):
            head, star, tail = pattern.partition("*")
            if star and spec.startswith(head) and spec.endswith(tail) and \
                    len(spec) >= len(head) + len(tail):
                middle = spec[len(head):len(spec) - len(tail)]
            elif not star and spec == pattern:
                middle = ""
            else:
                continue
            for t in targets if isinstance(targets, list) else [targets]:
                hit = self.find(base / t.replace("*", middle), root, index)
                if hit:
                    return ("file", hit)
        name = package_name(spec)
        local = self.workspaces(root).get(name)
        if local:
            folder, data = local
            sub = spec[len(name):].lstrip("/")
            entries = [sub] if sub else [data.get(k) for k in ("source", "types", "module", "main")
                                         if isinstance(data.get(k), str)] + ["src/index", "index"]
            for entry in entries:
                hit = self.find(folder / entry, root, index)
                if hit:
                    return ("file", hit)
        return ("package", name)

    # --------------------------------------------------------- the interface
    def links(self, f: File, index: dict) -> list:
        out = []
        for spec, nested in self.facts(f)["imports"]:
            hit = self.land(spec, f, index)
            if hit:
                out.append(Link(hit[1], None, nested) if hit[0] == "file"
                           else Link(None, hit[1], nested))
        return out

    def uses(self, f: File, index: dict) -> list:
        out = []
        for spec, name, line in self.facts(f)["uses"]:
            hit = self.land(spec, f, index)
            if hit and hit[0] == "file":
                out.append(Use(hit[1], name, line) if name else
                           Use(hit[1], None, line, "a module passed whole"))
        return out

    def outside(self, f: File) -> list:
        facts = self.facts(f)
        return connections(facts["calls"], urls_from(facts["strings"]), facts["env"],
                           SCRIPT_PROBES)


READERS: list = [PythonReader()]
try:
    READERS.append(ScriptReader())
except ImportError:
    pass          # no tree-sitter: TypeScript and JavaScript are left out


def reader_of(f: File):
    return next(r for r in READERS if r.lang == f.lang)


def files_in(root: Path, hidden: bool = False) -> list:
    """Every source file under root that some reader knows how to read."""
    by_suffix = {s: r for r in READERS for s in r.suffixes}
    paths = discover(root, hidden, tuple(by_suffix))
    # a .d.ts file declares types and runs nothing
    return [by_suffix[p.suffix].file_of(p, root) for p in paths if not p.name.endswith(".d.ts")]


# --------------------------------------------------------------------- build

def build(root: Path, externals: bool = False, hidden: bool = False,
          outside: bool = True, layout: str = "file",
          keep_empty: bool = False, reading: "Reading | None" = None,
          source: str = "tags") -> dict:
    files = files_in(root, hidden)
    index = {m.name: m for m in files}

    edges: dict = {}
    ext_hits: dict = defaultdict(int)
    endpoints: dict = {}

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
        reader = reader_of(f)
        for link in reader.links(f, index):
            kind = "lazy" if link.nested else "import"
            if link.target:
                add(f.name, link.target, kind)
                continue
            ext_hits[link.package] += 1
            if externals:
                add(f.name, "ext:" + link.package, kind)

        if outside:
            for conn in reader.outside(f):
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
    if reading is not None:
        graph["map"] = map_views(root, graph, reading, source)
        seen = set(used) | {e["kind"] for v in graph["map"]["views"].values()
                            for e in v["edges"]}
        graph["kinds"] = {k: KINDS[k] for k in KINDS if k in seen}
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
    labels: dict = {}
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


def place_inside(nodes: list, pairs: list, own: set, pinned: list) -> tuple:
    """Lay out the view inside one module so its own files sit in one block.

    Left to right: outside connections, the modules it uses, its own files by
    import depth, then the modules that use it. Every wire crossing the edge
    of the block is then another module coming in or going out. A module that
    does both goes on the side with more wires.
    """
    mine = [n["id"] for n in nodes if n["id"] in own]
    depth = layer(mine, [(s, d) for s, d in pairs if s in own and d in own])
    deepest = max(depth.values(), default=0)

    left, right = [], []
    for n in nodes:
        if n["id"] in own or n["group"] in pinned:
            continue
        uses = sum(1 for s, d in pairs if s in own and d == n["id"])
        used = sum(1 for s, d in pairs if d in own and s == n["id"])
        (right if used > uses else left).append(n["id"])

    col: dict = {}
    labels: list = []
    for group in pinned:
        for n in nodes:
            if n["group"] == group:
                col[n["id"]] = len(labels)
        labels.append(group.strip("()"))
    if left:
        col.update({i: len(labels) for i in left})
        labels.append("uses")
    for i in mine:
        col[i] = len(labels) + deepest - depth[i]      # imported on the left
    labels += [""] * (deepest + 1) if mine else []
    if right:
        col.update({i: len(labels) for i in right})
        labels.append("used by")

    columns: dict = defaultdict(list)
    order = {n["id"]: (n["group"], n["label"]) for n in nodes}
    for n in nodes:
        columns[col[n["id"]]].append(n["id"])
    for c in columns:
        columns[c].sort(key=lambda i: order[i])
    return col, order_rows(columns, pairs), [{"label": l} for l in labels]


MAP_BANDS = (("outside", "outside"), ("store", "stores"), ("module", "modules"),
             ("feature", "features"), ("trigger", "triggers"), ("component", "UI"),
             ("page", "pages"))


def place_map(nodes: list, pairs: list) -> tuple:
    """Lay out the map in bands, left to right as data flows to a person:
    outside connections, stores, modules, features, triggers, the pieces of
    UI, then pages. Modules that use other modules sit right of them."""
    band_of = {"external": "outside", "design": "component", "loose": "page"}
    kinds = {n["id"]: band_of.get(n["kind"], n["kind"]) for n in nodes}
    mods = [i for i, k in kinds.items() if k == "module"]
    depth = layer(mods, [(s, d) for s, d in pairs if s in set(mods) and d in set(mods)])
    deepest = max(depth.values(), default=0)

    col: dict = {}
    labels: list = []
    for kind, label in MAP_BANDS:
        ids = [i for i, k in kinds.items() if k == kind]
        if not ids:
            continue
        if kind == "module":
            for i in ids:
                col[i] = len(labels) + deepest - depth[i]      # used on the left
            labels += [label] + [""] * deepest
        else:
            col.update({i: len(labels) for i in ids})
            labels.append(label)
    for i in kinds:                                  # anything else, at the end
        if i not in col:
            col[i] = len(labels) - 1 if labels else 0

    columns: dict = defaultdict(list)
    order = {n["id"]: (n["group"], n["label"]) for n in nodes}
    for i in kinds:
        columns[col[i]].append(i)
    for c in columns:
        columns[c].sort(key=lambda i: order[i])
    return col, order_rows(columns, pairs), [{"label": l} for l in labels]


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


# ---------------------------------------------------------------------- tags
#
# Every source file says in a tag what it belongs to (docs/adr/0002): one
# comment line near its top that starts `codegraph:`. The tags, read
# together, are the declaration; what the code really does is read back
# against them. CONTEXT.md has the words.
#
#   # codegraph: module engine                 a file of the engine module
#   # codegraph: front door Book, tick         once per module
#   # codegraph: store members as Member       the module owns this store
#   # codegraph: reads services                and may read this one
#   // codegraph: feature plan-service in calendar
#   // codegraph: uses services, members
#   // codegraph: schedule every day at 08:00
#   // codegraph: event stripe-paid as PaidEvent
#   // codegraph: page members at /members     or: start page home at /
#   // codegraph: component people-picker
#   // codegraph: design system
#   # codegraph: test module engine            or: test feature X, test ui home, members
#   # codegraph: tooling

DECLARATION = "codegraph.json"     # the old declaration, read once to seed a draft
TAG_LINES = 30                     # a tag sits in a file's first lines
TEST_NAMES = ("test_*.py", "*_test.py", "conftest.py", "*.test.*", "*.spec.*")
TEST_DIRS = ("tests", "test", "__tests__", "e2e", "playwright", "cypress")
GENERIC_FOLDERS = ("src", "lib", "source")
TOOLING_NAMES = ("*.config.*", "setup.py", "noxfile.py", "tasks.py", "manage.py",
                 "fabfile.py", "gulpfile.*", "Gruntfile.*", "webpack.*", "rollup.*")
TOOLING_DIRS = ("scripts", "tools", "bin", "migrations", "alembic")

TAG_RE = re.compile(r"^\s*(?:#|//|/\*+|\*|--|<!--)\s*codegraph:\s*(.*?)\s*(?:\*/|-->)?\s*$")
NAME = r"([\w.\-/@]+)"
KINDS_OF_FILE = ("module", "feature", "page", "component", "design", "test", "tooling")
STATEMENTS = (
    # (pattern, what it says, the kinds of file that may say it)
    (re.compile(r"module " + NAME + r"$"), "module", None),
    (re.compile(r"feature " + NAME + r"(?: in " + NAME + r")?$"), "feature", None),
    (re.compile(r"(start )?page " + NAME + r"(?: at (\S+))?$"), "page", None),
    (re.compile(r"component " + NAME + r"$"), "component", None),
    (re.compile(r"design system$"), "design", None),
    (re.compile(r"test (module|feature) " + NAME + r"$"), "test", None),
    (re.compile(r"test (ui)(?: (.+))?$"), "test", None),
    (re.compile(r"tooling$"), "tooling", None),
    (re.compile(r"front door\s*(.*)$"), "door", "module"),
    (re.compile(r"store " + NAME + r"(?: as " + NAME + r")?$"), "store", "module"),
    (re.compile(r"reads (.+)$"), "reads", "module"),
    (re.compile(r"uses (.+)$"), "uses", "feature"),
    (re.compile(r"schedule (.+)$"), "schedule", "feature"),
    (re.compile(r"event " + NAME + r"(?: as " + NAME + r")?$"), "event", "feature"),
)


def _names(text: str) -> list:
    return [n.strip() for n in text.split(",") if n.strip() and n.strip() != "none"]


@dataclass
class Tag:
    """What one file's tags say."""
    kind: str = ""
    name: str = ""
    line: int = 0
    system: str = ""
    door: list | None = None          # a module's front door, on one of its files
    stores: list = field(default_factory=list)     # [(store, schema or "", line)]
    reads: list = field(default_factory=list)
    uses: list = field(default_factory=list)
    schedules: list = field(default_factory=list)
    events: list = field(default_factory=list)     # [(event, schema or "")]
    route: str = ""
    start: bool = False
    of: str = ""                      # a test's kind: module, feature or ui
    walks: list = field(default_factory=list)      # the pages a UI test walks
    errors: list = field(default_factory=list)     # [(line, text)]

    @property
    def unit(self) -> str:
        if self.kind in ("module", "feature", "page", "component"):
            return self.kind + ":" + self.name
        return self.kind


def read_tags(text: str) -> Tag | None:
    """The tags in a file's first lines, or None when it has none."""
    tag, seen, said = Tag(), False, []
    for no, line in enumerate(text.splitlines()[:TAG_LINES], start=1):
        m = TAG_RE.match(line)
        if not m:
            continue
        seen, stmt = True, m.group(1)
        for pattern, what, only in STATEMENTS:
            hit = pattern.match(stmt)
            if hit:
                break
        else:
            tag.errors.append((no, "cannot read the tag `codegraph: {}`".format(stmt)))
            continue
        if only is None:                                   # says what the file is
            if tag.kind:
                tag.errors.append((no, "has two tags saying what it is: {} and {}"
                                   .format(tag.kind, what)))
                continue
            tag.kind, tag.line = what, no
            g = hit.groups()
            if what == "feature":
                tag.name, tag.system = g[0], g[1] or ""
            elif what == "page":
                tag.start, tag.name, tag.route = bool(g[0]), g[1], g[2] or ""
            elif what == "test":
                tag.of = g[0]
                tag.name = g[1] if g[0] != "ui" else ""
                tag.walks = _names(g[1] or "") if g[0] == "ui" else []
            elif what in ("module", "component"):
                tag.name = g[0]
            continue
        g = hit.groups()
        if what == "door":
            tag.door = (tag.door or []) + _names(g[0])
        elif what == "store":
            tag.stores.append((g[0], g[1] or "", no))
        elif what == "reads":
            tag.reads += _names(g[0])
        elif what == "uses":
            tag.uses += _names(g[0])
        elif what == "schedule":
            tag.schedules.append(g[0])
        elif what == "event":
            tag.events.append((g[0], g[1] or ""))
        said.append((no, what, only))
    if not seen:
        return None
    for no, what, only in said:
        if tag.kind != only:
            tag.errors.append((no, "a {} tag cannot say `{}`; only a {} can".format(
                tag.kind or "file with no kind", what.replace("door", "front door"), only)))
    if not tag.kind and not tag.errors:
        tag.errors.append((1, "has tags but none says what the file is"))
    return tag


def file_tags(f: File) -> Tag | None:
    try:
        with open(f.path, encoding="utf-8", errors="replace") as fh:
            head = "".join(next(fh, "") for _ in range(TAG_LINES))
    except OSError:
        return None
    return read_tags(head)


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


# ---------------------------------------------------------------- the rules
#
# What an import from one kind of file into another is. A pair that is not
# here breaks a rule, and WRONG says which.

RELATIONS = {
    ("module", "module"): "import",
    ("feature", "module"): "uses",
    ("page", "module"): "informed", ("component", "module"): "informed",
    ("page", "feature"): "acts", ("component", "feature"): "acts",
    ("page", "component"): "contains", ("component", "component"): "contains",
    ("page", "design"): None, ("component", "design"): None, ("design", "design"): None,
}
UI_KINDS = ("page", "component", "design")


def relation(a: str, b: str) -> tuple:
    """(wire kind, rule broken) for an import from a file of kind a into one
    of kind b. Tests and tooling stand outside the program, so nothing they
    import is a wire, and nothing in the program may import them."""
    if a in ("test", "tooling"):
        return None, None
    if b == "test":
        return None, "the program never imports a test"
    if b == "tooling":
        return None, "the program never imports tooling"
    if (a, b) in RELATIONS:
        return RELATIONS[(a, b)], None
    if a == "module":
        return None, "a module never calls a feature or the UI"
    if a == "feature":
        return None, ("a feature never calls another feature; share the work "
                      "through a module" if b == "feature" else
                      "a feature never reaches into the UI")
    if a == "design":
        return None, ("the design system has no wires; a piece that needs data or "
                      "starts a feature is a component")
    if b == "page":
        return None, ("a page never imports another page; share the piece as a "
                      "component, or link to the page" if a == "page" else
                      "a component never contains a page")
    return None, "{} to {} is not a wire codegraph knows".format(a, b)


@dataclass
class Unit:
    """A module, feature, page or component, or the design system: the files
    whose tags name it, and what those tags say about it."""
    id: str
    kind: str
    name: str
    files: list = field(default_factory=list)
    door: set | None = None
    door_at: list = field(default_factory=list)
    system: str = ""
    uses: set = field(default_factory=set)
    reads: set = field(default_factory=set)
    schedules: list = field(default_factory=list)
    events: list = field(default_factory=list)
    route: str = ""
    start: bool = False

    @property
    def label(self) -> str:
        return "the design system" if self.kind == "design" else \
            "{} {}".format(self.kind, self.name)


@dataclass(frozen=True)
class Crossing:
    """One name one module takes from another."""
    src: str             # dotted name of the file that uses it
    dst: str             # dotted name of the file it comes from
    there: str           # the unit it comes from
    name: str
    ok: bool             # on that module's front door


@dataclass
class Reading:
    """The code, read against its tags. The check and the page's map views
    both start here, so they cannot disagree."""
    files: list
    tags: dict           # file -> Tag
    owner: dict          # file -> unit id
    units: dict          # unit id -> Unit
    tests: set
    mismatches: list
    unknown: list
    crossings: list
    bad: dict            # (unit, unit) -> the rules an import between them breaks
    wires: list          # (from, to, kind): writes, reads, starts and leads
    stores: dict         # store -> {"owner", "readers", "schema", "rel"}
    triggers: list       # schedules and events, each a card of its own


def _sorted(findings: list) -> list:
    return sorted(set(findings))


# Data calls that name a store. How: writes, reads, or touches when a call
# could do either.
STORE_CALLS = (
    (re.compile(r"\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bREPLACE\s+INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bUPDATE\s+[`\"\[]?(\w+)[`\"\]]?\s+SET\b", re.I), "writes"),
    (re.compile(r"\bDELETE\s+FROM\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bSELECT\b[^;'\"`]{0,400}?\bFROM\s+[`\"\[]?(\w+)", re.I), "reads"),
    (re.compile(r"\bJOIN\s+[`\"\[]?(\w+)"), "reads"),
    (re.compile(r"\.\s*(?:collection|get_collection|getCollection|table)\(\s*['\"`]([\w\-]+)['\"`]"),
     "touches"),
    (re.compile(r"\bsupabase\w*\s*\.\s*from\(\s*['\"`]([\w\-]+)['\"`]"), "touches"),
)
NOT_STORES = {"sqlite_master", "sqlite_schema", "information_schema", "dual", "pg_catalog"}


def store_calls(text: str) -> list:
    """(store, how, line) for every data call naming a store, first per store."""
    out, seen = [], set()
    for regex, how in STORE_CALLS:
        for m in regex.finditer(text):
            name = m.group(1)
            if name.lower() in NOT_STORES or (name, how) in seen:
                continue
            seen.add((name, how))
            out.append((name, how, text.count("\n", 0, m.start()) + 1))
    return out


# Links a page or component follows, as written in its code.
LINK_RES = (
    re.compile(r"""\b(?:href|to)\s*=\s*\{?\s*(["'`])(.*?)\1"""),
    re.compile(r"""\b(?:navigate|navigateTo|push|replace|redirect|goto)\(\s*(["'`])(.*?)\1"""),
)
BUILT_LINK_RES = (
    re.compile(r"""\b(?:href|to)\s*=\s*\{\s*(?![\s"'`])"""),
    re.compile(r"""\b(?:router\.push|router\.replace|navigate|redirect)\(\s*(?![\s"'`)])"""),
)


def page_links(text: str) -> list:
    """(link, line) for each link written out, and (None, line) for each one
    built while the program runs, which cannot be followed."""
    out = []
    for regex in LINK_RES:
        for m in regex.finditer(text):
            link = m.group(2)
            if link.startswith("/") and not link.startswith("//"):
                out.append((link, text.count("\n", 0, m.start()) + 1))
    for regex in BUILT_LINK_RES:
        for m in regex.finditer(text):
            out.append((None, text.count("\n", 0, m.start()) + 1))
    return out


def route_of(rel: str) -> str:
    """The route a framework gives a page file: Next.js app/ and pages/."""
    parts = rel.split("/")
    stem = parts[-1].rsplit(".", 1)[0]
    folders = parts[:-1]
    if "app" in folders and stem == "page":
        i = len(folders) - 1 - folders[::-1].index("app")
        segs = [p for p in folders[i + 1:] if not (p.startswith("(") and p.endswith(")"))
                and not p.startswith("@")]
        return "/" + "/".join(segs)
    if "pages" in folders:
        i = len(folders) - 1 - folders[::-1].index("pages")
        segs = folders[i + 1:] + ([] if stem == "index" else [stem])
        if stem.startswith("_") or (segs and segs[0] == "api"):
            return ""
        return "/" + "/".join(segs)
    return ""


def _segs(path: str) -> list:
    path = re.split(r"[?#]", path)[0].strip("/")
    return path.split("/") if path else []


def route_matches(link: str, route: str) -> bool:
    """Does a written link land on a page's route? `[id]` and `:id` take any
    one part, `[...rest]` the rest, and `${...}` in the link stands for any."""
    a, b = _segs(link), _segs(route)
    for i, r in enumerate(b):
        if r.startswith("[...") or r.startswith("[[..."):
            return len(a) >= i
        if i >= len(a):
            return False
        if not (r.startswith("[") or r.startswith(":") or "${" in a[i] or a[i] == r):
            return False
    return len(a) == len(b)


FAKE_PY = re.compile(r"""\b(?:patch|setattr)\(\s*["']([A-Za-z_][\w.]*)["']""")
FAKE_JS = re.compile(r"""\b(?:jest|vi)\s*\.\s*(?:mock|doMock|unstable_mockModule)\(\s*["']([^"']+)["']""")


def _defined(path: Path) -> set:
    """The names a Python file defines at its top level."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, SyntaxError, ValueError):
        return set()
    out = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.add(node.name)
        elif isinstance(node, ast.Assign):
            out |= {t.id for t in node.targets if isinstance(t, ast.Name)}
    return out


def fakes(f: File, text: str, index: dict) -> list:
    """(what, line) for each piece of the repo's own code a test fakes. Faking
    what a file imports from outside, `patch("app.bars.httpx")`, is fine."""
    out = []
    if f.lang == "python":
        for m in FAKE_PY.finditer(text):
            parts = m.group(1).split(".")
            for i in range(len(parts), 0, -1):
                head = ".".join(parts[:i])
                if head in index:
                    rest = parts[i:]
                    if not rest or rest[0] in _defined(index[head].path):
                        out.append((m.group(1), text.count("\n", 0, m.start()) + 1))
                    break
    else:
        reader = reader_of(f)
        for m in FAKE_JS.finditer(text):
            hit = reader.land(m.group(1), f, index)
            if hit and hit[0] == "file":
                out.append((m.group(1), text.count("\n", 0, m.start()) + 1))
    return out


def _text(f: File) -> str:
    try:
        return f.path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def read_map(root: Path, hidden: bool = False, drafted: dict | None = None) -> Reading:
    """Read the code against its tags, every rule in CONTEXT.md at once.

    `drafted` stands in for the tags of files that have none, by path: how
    the page draws a codebase nobody has tagged yet.
    """
    files = files_in(root, hidden)
    index = {f.name: f for f in files}
    mis: list = []
    unk: list = []
    tags: dict = {}
    owner: dict = {}
    units: dict = {}
    store_tags: list = []

    # ---- what each file says it is
    for f in files:
        t = file_tags(f)
        if t is None and drafted:
            t = drafted.get(f.rel)
        if t is None:
            mis.append(Finding(f.rel, 0, "has no codegraph tag saying what it belongs to"))
            continue
        mis += [Finding(f.rel, line, text) for line, text in t.errors]
        if not t.kind:
            continue
        tags[f.name] = t
        u = units.setdefault(t.unit, Unit(t.unit, t.kind, t.name))
        u.files.append(f.name)
        owner[f.name] = u.id
        if t.door is not None:
            u.door = (u.door or set()) | set(t.door)
            u.door_at.append(f.rel)
        if t.system:
            if u.system and u.system != t.system:
                mis.append(Finding(f.rel, t.line, "puts {} in system {}, but another of its "
                                   "files says {}".format(u.label, t.system, u.system)))
            u.system = u.system or t.system
        if t.route:
            u.route = u.route or t.route
        u.uses |= set(t.uses)
        u.reads |= set(t.reads)
        u.schedules += t.schedules
        u.events += t.events
        u.start |= t.start
        store_tags += [(s, schema, f, line, u.id) for s, schema, line in t.stores]

    tests = {n for n, t in tags.items() if t.kind == "test"}

    def first(u: Unit) -> str:
        return index[u.files[0]].rel

    # ---- what each unit says about itself
    for u in units.values():
        if u.kind == "module":
            if not u.door_at:
                mis.append(Finding(first(u), 0, "{} has no front door: add `codegraph: front "
                                   "door <names>` to one of its files".format(u.label)))
            for rel in u.door_at[1:]:
                mis.append(Finding(rel, 0, "{} has its front door written in more than one "
                                   "file; keep it on one".format(u.label)))
        if u.kind == "feature":
            if not u.system:
                mis.append(Finding(first(u), 0, "{} names no system: write `feature {} in "
                                   "<system>`".format(u.label, u.name)))
            for m in sorted(u.uses):
                if "module:" + m not in units:
                    mis.append(Finding(first(u), 0, "{} uses {}, which is not a module"
                                       .format(u.label, m)))

    # ---- stores, and the shapes their schemas give them
    schemas: list = []
    for f in files:
        schemas += shapes.schemas_in(f.rel, _text(f))
    for p in shapes.schema_files(root, SKIP_DIRS):
        rel = p.relative_to(root).as_posix()
        schemas += shapes.schemas_in(rel, p.read_text(encoding="utf-8", errors="replace"))

    stores: dict = {}
    for s, schema, f, line, uid in store_tags:
        if s in stores:
            mis.append(Finding(f.rel, line, "store {} is owned by {} and {}; a store has one "
                               "owning module".format(s, units[stores[s]["owner"]].label,
                                                      units[uid].label)))
            continue
        found = shapes.find(schemas, schema or s, near=f.rel, exact=bool(schema))
        if not found:
            mis.append(Finding(f.rel, line, "store {} {}".format(s, (
                "names the schema {}, which codegraph cannot find".format(schema) if schema
                else "has no schema codegraph can read; add one the module checks its "
                     "data against"))))
        stores[s] = {"owner": uid, "readers": set(), "schema": found, "rel": f.rel}
    for u in units.values():
        for r in sorted(u.reads):
            if r in stores:
                stores[r]["readers"].add(u.id)
            else:
                mis.append(Finding(first(u), 0, "{} reads store {}, which no module owns"
                                   .format(u.label, r)))
    lower = {s.lower(): s for s in stores}

    # ---- the code itself, file by file
    crossings: list = []
    bad: dict = defaultdict(list)
    acted: set = set()
    contains: dict = defaultdict(set)
    used: dict = defaultdict(set)
    links: dict = defaultdict(set)
    built_links = False
    for f in files:
        here = owner.get(f.name)
        if here is None:
            continue
        me, kind, text = units[here], units[here].kind, _text(f)
        reader = reader_of(f)
        uses = reader.uses(f, index)
        line_of: dict = {}
        for u in uses:
            line_of.setdefault(u.target, u.line)
        targets = dict.fromkeys(l.target for l in reader.links(f, index) if l.target)

        for tgt in targets:
            there = owner.get(tgt)
            if there is None or there == here:
                continue
            them = units[there]
            wire, wrong = relation(kind, them.kind)
            line = line_of.get(tgt, 0)
            if wrong:
                mis.append(Finding(f.rel, line, "imports {} from {}: {}".format(
                    index[tgt].rel, them.label, wrong)))
                bad[(here, there)].append(wrong)
            if wire == "acts":
                acted.add(there)
            elif wire == "contains":
                contains[here].add(there)
            elif wire == "uses":
                used[here].add(them.name)
                if them.name not in me.uses:
                    wrong = "uses {} without saying so; add it to `uses`".format(them.label)
                    mis.append(Finding(f.rel, line, "{} {}".format(me.label, wrong)))
                    bad[(here, there)].append(wrong)

        for u in uses:
            there = owner.get(u.target)
            if there is None or there == here or kind == "tooling" or \
                    units[there].kind != "module":
                continue
            if u.name is None:
                unk.append(Finding(f.rel, u.line, "uses {} in a way that cannot be read ({})"
                                   .format(units[there].label, u.why)))
                continue
            ok = u.name in (units[there].door or set())
            crossings.append(Crossing(f.name, u.target, there, u.name, ok))
            if not ok:
                mis.append(Finding(f.rel, u.line, "uses {} from {}, which is not on its front "
                                   "door".format(u.name, units[there].label)))

        if kind in ("test", "tooling"):
            if kind == "test":
                for what, line in fakes(f, text, index):
                    mis.append(Finding(f.rel, line, "fakes {}, code in the repo; a test fakes "
                                       "only outside connections".format(what)))
            continue

        if kind != "module":
            for conn in reader.outside(f):
                if conn.kind != "serves":
                    mis.append(Finding(f.rel, 0, "reaches {} ({}); only a module reaches an "
                                       "outside connection".format(conn.label,
                                                                   KINDS[conn.kind]["label"])))

        for name, how, line in store_calls(text):
            s = lower.get(name.lower())
            if s is None:
                mis.append(Finding(f.rel, line, "reaches {}, which is not a declared store; tag "
                                   "its schema in the module that owns it with `codegraph: "
                                   "store {}`".format(name, name)))
            elif kind != "module":
                mis.append(Finding(f.rel, line, "reaches store {} directly; only a module reaches "
                                   "a store, so go through {}".format(
                                       s, units[stores[s]["owner"]].label)))
            elif here == stores[s]["owner"]:
                continue
            elif how == "writes":
                mis.append(Finding(f.rel, line, "writes store {}, which {} owns; only its owner "
                                   "writes".format(s, units[stores[s]["owner"]].label)))
            elif here not in stores[s]["readers"]:
                mis.append(Finding(f.rel, line, "reads store {} without saying so; add `codegraph: "
                                   "reads {}`, or go through {}".format(
                                       s, s, units[stores[s]["owner"]].label)))

        if kind in ("page", "component"):
            for link, line in page_links(text):
                if link is None:
                    built_links = True
                    unk.append(Finding(f.rel, line, "builds a link while it runs; where it "
                                       "leads cannot be told"))
                else:
                    links[here].add((link, f.rel, line))

    # ---- features: what they said they use, and what starts them
    triggers: list = []
    for u in units.values():
        if u.kind != "feature":
            continue
        for m in sorted(u.uses - used[u.id]):
            if "module:" + m in units:
                mis.append(Finding(first(u), 0, "{} says it uses module {} but never does"
                                   .format(u.label, m)))
        if not (u.schedules or u.events or u.id in acted):
            mis.append(Finding(first(u), 0, "{} has no trigger: no page acts on it, and it "
                               "has no schedule or event".format(u.label)))
        for i, timing in enumerate(u.schedules):
            triggers.append({"id": "trigger:{}:{}".format(u.id, i), "kind": "schedule",
                             "label": timing, "feature": u.id, "fields": []})
        for i, (event, schema) in enumerate(u.events, start=len(u.schedules)):
            found = shapes.find(schemas, schema, near=first(u), exact=True) if schema else None
            if not schema:
                unk.append(Finding(first(u), 0, "event {} names no schema (`as <Type>`), so what "
                                   "it carries cannot be shown".format(event)))
            elif not found:
                mis.append(Finding(first(u), 0, "event {} names the schema {}, which codegraph "
                                   "cannot find".format(event, schema)))
            triggers.append({"id": "trigger:{}:{}".format(u.id, i), "kind": "event",
                             "label": event, "feature": u.id,
                             "fields": found.lines() if found else []})

    # ---- tests: what each says it tests
    walked: set = set()
    for n in sorted(tests):
        t, f = tags[n], index[n]
        if t.of in ("module", "feature"):
            target = units.get(t.of + ":" + t.name)
            if target is None:
                mis.append(Finding(f.rel, t.line, "tests {} {}, which is not a {}".format(
                    t.of, t.name, t.of)))
            elif t.of == "feature" and not {l.target for l in reader_of(f).links(f, index)} \
                    & set(target.files):
                mis.append(Finding(f.rel, t.line, "is a test of {} but never starts it".format(
                    target.label)))
        for p in t.walks:
            if "page:" + p in units:
                walked.add("page:" + p)
            else:
                mis.append(Finding(f.rel, t.line, "walks page {}, which is not a page".format(p)))

    # ---- pages: where each is, where its links lead, and who walks it
    pages = {k: u for k, u in units.items() if u.kind == "page"}
    for u in pages.values():
        u.route = u.route or next((r for r in (route_of(index[n].rel) for n in u.files) if r), "")
    leads: dict = defaultdict(set)
    for p in pages:
        seen, stack = {p}, [p]
        while stack:                       # a component's links belong to its pages
            for c in contains.get(stack.pop(), ()):
                if c not in seen:
                    seen.add(c); stack.append(c)
        for holder in seen:
            for link, rel, line in links.get(holder, ()):
                hits = [q for q, v in pages.items() if v.route and route_matches(link, v.route)]
                if not hits:
                    unk.append(Finding(rel, line, "links to {}, which no page is at".format(link)))
                leads[p] |= {q for q in hits if q != p}
    if pages:
        starts = [p for p, u in pages.items() if u.start]
        if not starts:
            mis.append(Finding(first(min(pages.values(), key=lambda u: u.id)), 0,
                               "no page is a start page: mark one `codegraph: start page <name>`"))
        reach, stack = set(starts), list(starts)
        while stack:
            for q in leads.get(stack.pop(), ()):
                if q not in reach:
                    reach.add(q); stack.append(q)
        for p in sorted(set(pages) - reach):
            if starts:
                (unk if built_links else mis).append(Finding(
                    first(pages[p]), 0, "{} cannot be reached from a start page by following "
                    "its links".format(pages[p].label)))
        for p in sorted(set(pages) - walked):
            mis.append(Finding(first(pages[p]), 0, "no UI test walks {}; name it in a test's "
                               "`codegraph: test ui` tag".format(pages[p].label)))

    wires = [(stores[s]["owner"], "store:" + s, "writes") for s in sorted(stores)]
    wires += [(r, "store:" + s, "reads") for s in sorted(stores)
              for r in sorted(stores[s]["readers"])]
    wires += [(t["id"], t["feature"], "starts") for t in triggers]
    wires += [(p, q, "leads") for p in sorted(leads) for q in sorted(leads[p])]

    return Reading(files, tags, owner, units, tests, _sorted(mis), _sorted(unk), crossings,
                   dict(bad), wires, stores, triggers)


def check(root: Path, hidden: bool = False) -> Report:
    """Read the code back against its tags: every file tagged, every name that
    crosses into a module on its front door, every import one the layers
    allow, every store reached only by its modules, every page reachable."""
    r = read_map(root, hidden)
    return Report(r.mismatches, r.unknown)


# ----------------------------------------------------------------- map views
#
# The page's levels. The map: every module, feature, page and component as a
# card, with the stores, triggers and outside connections they touch, and the
# wires between them. The pages: where a person can go. Inside each card, its
# own files beside the cards they touch.

STORES, TRIGGERS, UI_GROUP = "(stores)", "(triggers)", "(ui)"
NAMED_WIRES = ("import", "lazy", "uses", "informed", "acts", "contains")
TESTS_CARD, TOOLING_CARD, LOOSE_CARD = "test", "tooling", "(untagged)"


def _group(u: Unit) -> str:
    if u.kind == "feature":
        return "system:" + (u.system or "?")
    if u.kind in UI_KINDS:
        return UI_GROUP
    return u.id


def _about(u: Unit, n: int) -> str:
    files = "1 file" if n == 1 else "{} files".format(n)
    if u.kind == "feature":
        return "{} · {}".format(u.system or "no system", files)
    if u.kind == "page":
        return "{}{} · {}".format("start · " if u.start else "", u.route or "page", files)
    if u.kind in ("component", "design"):
        return "{} · {}".format("design system" if u.kind == "design" else "component", files)
    return files


def map_views(root: Path, graph: dict, r: Reading, source: str = "tags") -> dict:
    shown = {n["id"]: n for n in graph["nodes"]}
    is_file = {f.name for f in r.files}
    units = r.units

    def card(fid: str) -> str:
        if fid not in is_file:
            return fid                                  # outside or third party
        return r.owner.get(fid, LOOSE_CARD)

    cards: dict = {}
    for uid, u in units.items():
        ids = sorted(n for n in u.files if n in shown)
        cards[uid] = {
            "id": uid, "label": u.name or ("design system" if u.kind == "design" else u.kind),
            "kind": u.kind, "dir": _about(u, len(ids)), "group": _group(u),
            "lines": sum(shown[i]["lines"] for i in ids), "files": ids,
            "door": sorted(u.door or ()), "system": u.system, "uses": sorted(u.uses),
            "route": u.route, "start": u.start,
            "stores": sorted(s for s, v in r.stores.items() if v["owner"] == uid),
            "reads": sorted(u.reads),
        }
    loose = sorted(n["id"] for n in graph["nodes"] if n["kind"] == "file" and card(n["id"]) == LOOSE_CARD)
    if loose:
        cards[LOOSE_CARD] = {"id": LOOSE_CARD, "label": "untagged", "kind": "loose",
                             "dir": "{} files with no tag".format(len(loose)), "group": LOOSE_CARD,
                             "lines": sum(shown[i]["lines"] for i in loose), "files": loose}
    for s, v in r.stores.items():
        schema = v["schema"]
        cards["store:" + s] = {
            "id": "store:" + s, "label": s, "kind": "store", "group": STORES, "lines": 0,
            "dir": "owned by " + units[v["owner"]].name, "files": [],
            "fields": schema.lines() if schema else [],
            "schema": "{}:{}".format(schema.rel, schema.line) if schema else "",
            "owner": v["owner"], "readers": sorted(v["readers"]),
        }
    for t in r.triggers:
        cards[t["id"]] = {"id": t["id"], "label": t["label"], "kind": "trigger",
                          "group": TRIGGERS, "lines": 0, "dir": t["kind"], "files": [],
                          "fields": t["fields"], "feature": t["feature"]}

    def kind_of(e: dict):
        """The wire an import between two files is, by what the files belong to,
        and the rules it breaks. None when it is no wire on the map."""
        k = e["kind"]
        ua, ub = r.owner.get(e["from"]), r.owner.get(e["to"])
        if k not in ("import", "lazy") or not ua or not ub or ua == ub:
            return k, []
        wire, wrong = relation(units[ua].kind, units[ub].kind)
        why = r.bad.get((ua, ub), [])
        if wrong:
            return "import", why or [wrong]
        if wire is None:
            return None, []
        return (k if wire == "import" else wire), why

    def view(title: str, unit: str, own: list, mapping, keep, group: str = "",
             inside: str = "") -> dict:
        """Lift the file graph through `mapping`, keep the wires that touch
        `own` between cards that `keep` allows, and lay out what is left.
        Inside a card, its stores and triggers wire to the file that holds
        the store's tag, else to its first file."""
        def anchor(other: str) -> str:
            s = r.stores.get(other[6:]) if other.startswith("store:") else None
            held = next((f.name for f in r.files if s and f.rel == s["rel"]), None)
            return held if held in own else own[0]
        wires: dict = {}
        for e in graph["edges"]:
            a, b = mapping(e["from"]), mapping(e["to"])
            if a == b or not (a in own or b in own) or not (keep(a) and keep(b)):
                continue
            k, why = kind_of(e)
            if k is None:
                continue
            key = (a, b, "import" if k in ("import", "lazy") else k)
            w = wires.setdefault(key, {"from": a, "to": b, "kind": k, "names": set(),
                                       "bad": set(), "via": set(), "why": set()})
            if w["kind"] == "lazy" and k == "import":
                w["kind"] = "import"      # a real import beats one in a function
            if a != e["from"]:
                w["via"].add(e["from"])   # the files on a card this wire comes from
            w["why"] |= set(why)
        named: dict = defaultdict(list)
        for w in wires.values():
            if w["kind"] in NAMED_WIRES:
                named[(w["from"], w["to"])].append(w)
        for c in r.crossings:
            for w in named.get((mapping(c.src), mapping(c.dst)), ()):
                w["names"].add(c.name)
                if not c.ok:
                    w["bad"].add(c.name)
        for a, b, k in r.wires:
            if inside:                       # the card's own end lands on one of its files
                a, b = (anchor(b) if a == inside else a), (anchor(a) if b == inside else b)
            if (a in own or b in own) and (a in cards or a in own) and                     (b in cards or b in own) and keep(a) and keep(b):
                wires.setdefault((a, b, k), {"from": a, "to": b, "kind": k, "names": set(),
                                             "bad": set(), "via": set(), "why": set()})
        edges = [dict(w, names=sorted(w["names"]), bad=sorted(w["bad"]), via=sorted(w["via"]),
                      why=sorted(w["why"]))
                 for _, w in sorted(wires.items())]

        ids = list(dict.fromkeys(own + [x for w in edges for x in (w["from"], w["to"])]))
        nodes = [dict(cards.get(i) or shown[i]) for i in ids]
        tail = [g for g in (EXTERNAL, STORES, OUTSIDE) if any(n["group"] == g for n in nodes)]
        pairs = [(w["from"], w["to"]) for w in edges if w["kind"] != "leads"]
        if unit == "files":
            for n in nodes:
                n["own"] = n["id"] in own
            col, row, columns = place_inside(nodes, pairs, set(own), tail)
        elif unit == "pages":
            col, row, columns = place_by_file(nodes, [(b, a) for a, b in
                                                      ((w["from"], w["to"]) for w in edges)], [])
        else:
            col, row, columns = place_map(nodes, pairs)
        for n in nodes:
            n["col"], n["row"] = col[n["id"]], row[n["id"]]
        groups = list(dict.fromkeys(n["group"] for n in nodes if n["group"] not in tail))
        return {"title": title, "unit": unit, "nodes": nodes, "edges": edges,
                "columns": columns, "groups": groups + tail, "group": group}

    on_map = [c for c, v in cards.items() if v["kind"] not in ("test", "tooling")]
    views = {"map": view("Map", "units", sorted(on_map), card,
                         lambda c: c not in (TESTS_CARD, TOOLING_CARD))}
    top = ["map"]
    pages = sorted(c for c, v in cards.items() if v["kind"] == "page")
    if pages:
        views["pages"] = view("Pages", "pages", pages, card, lambda c: c in pages)
        top.append("pages")
    for cid in on_map:
        own = cards[cid]["files"]
        if own:
            views[cid] = view(cards[cid]["label"], "files", own,
                              lambda fid, own=set(own): fid if fid in own else card(fid),
                              lambda c: c not in (TESTS_CARD, TOOLING_CARD),
                              cards[cid]["group"], cid)

    return {"source": source, "top": top, "views": views,
            "mismatches": [str(m) for m in r.mismatches],
            "unknown": [str(u) for u in r.unknown]}


# ------------------------------------------------------------------ drafting
#
# A first set of tags, made from what the code does today. Setup writes it
# into the files, then the agent running setup corrects it by judgment: the
# draft knows folders and imports, not what the program is for.

DESIGN_DIRS = ("ui", "design-system", "design", "theme", "tokens", "styles", "primitives")
COMPONENT_DIRS = ("components", "component", "widgets")
PAGE_DIRS = ("pages", "views", "screens", "routes")
UI_TEST_HINTS = ("@playwright/test", "cypress", "playwright", "selenium", "puppeteer")


def looks_like_test(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in TEST_DIRS for p in parts[:-1]) or \
        any(fnmatchcase(parts[-1], p) for p in TEST_NAMES)


def looks_like_tooling(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in TOOLING_DIRS for p in parts[:-1]) or \
        any(fnmatchcase(parts[-1], p) for p in TOOLING_NAMES)


def _slug(s: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", s)
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


def _ui_kind(f: File) -> tuple | None:
    """(kind, name) for a file that draws UI, else None."""
    parts = f.rel.split("/")
    folders, stem = parts[:-1], parts[-1].rsplit(".", 1)[0]
    if stem == "page" and "app" in folders or "pages" in folders and route_of(f.rel):
        route = route_of(f.rel)
        name = "home" if route == "/" else _slug(route.replace("[", "").replace("]", ""))
        return "page", name
    if f.lang != "script" or not f.rel.endswith((".tsx", ".jsx")):
        return None
    name = _slug(folders[-1] if stem == "index" and folders else stem)
    if any(p in DESIGN_DIRS for p in folders):
        return "design", ""
    if any(p in PAGE_DIRS for p in folders):
        return "page", name
    if stem in ("App", "app") and not any(p in COMPONENT_DIRS for p in folders):
        return "page", "app"
    return "component", name


def draft_tags(root: Path, hidden: bool = False) -> dict:
    """{path: [statements]} for every file that has no tag yet.

    Tests and tooling are found by their names. UI is found by where
    frameworks put it. A folder named features holds features. The rest is
    one module per folder, its front door what the program takes across
    today, so the program passes at once and only what reaches in shows red.
    An old codegraph.json, if there is one, says the modules instead.
    """
    files = files_in(root, hidden)
    index = {f.name: f for f in files}
    have = {f.name: file_tags(f) for f in files}
    todo = [f for f in files if have[f.name] is None]

    seed: dict = {}
    old = root / DECLARATION
    if old.exists():
        try:
            seed = json.loads(old.read_text(encoding="utf-8")).get("modules", {}) or {}
        except (ValueError, AttributeError):
            seed = {}

    groups = sorted({f.group for f in files})
    def short(group: str) -> str:
        # packages/core/src is "core": src and lib say nothing about the job
        parts = group.split("/")
        while len(parts) > 1 and parts[-1] in GENERIC_FOLDERS:
            parts.pop()
        return parts[-1]
    lasts = defaultdict(int)
    for g in groups:
        lasts[short(g)] += 1
    def name_of(group: str) -> str:
        if group == ".":
            return _slug(root.resolve().name)
        return short(group) if lasts[short(group)] == 1 else group

    # what every file is, as tags already say or as the draft guesses
    kind: dict = {}
    for f in files:
        t = have[f.name]
        if t is not None:
            kind[f.name] = (t.kind, t.name, t.system)
            continue
        homes = [n for n, m in seed.items() if _any_match(f.rel, m.get("files", []))]
        parts = f.rel.split("/")
        if looks_like_test(f.rel):
            kind[f.name] = ("test", "", "")
        elif looks_like_tooling(f.rel):
            kind[f.name] = ("tooling", "", "")
        elif homes:
            kind[f.name] = ("module", homes[0], "")
        elif "features" in parts[:-1]:
            rest = parts[parts.index("features") + 1:]
            stem = rest[-1].rsplit(".", 1)[0]
            system = rest[0] if len(rest) > 1 else "main"
            name = rest[1] if len(rest) > 2 else (stem if stem != "index" or len(rest) < 2
                                                  else rest[-2])
            kind[f.name] = ("feature", _slug(name), _slug(system))
        elif _ui_kind(f):
            k, n = _ui_kind(f)
            kind[f.name] = (k, n, "")
        else:
            kind[f.name] = ("module", name_of(f.group), "")

    def unit(name: str) -> str:
        k, n, _ = kind[name]
        return k + ":" + n if k in ("module", "feature", "page", "component") else k

    out: dict = {f.rel: [] for f in todo}
    mine = {f.rel for f in todo}
    members: dict = defaultdict(list)
    for f in files:
        members[unit(f.name)].append(f)

    # what crosses between units today: front doors, uses, what tests touch
    door: dict = defaultdict(set)
    door_from: dict = defaultdict(lambda: defaultdict(int))
    uses: dict = defaultdict(set)
    touched: dict = defaultdict(lambda: defaultdict(int))
    for f in files:
        here = unit(f.name)
        for u in reader_of(f).uses(f, index):
            there = unit(u.target) if u.target in kind else None
            if not there or there == here:
                continue
            touched[f.name][there] += 1
            if there.startswith("module:"):
                if here.startswith("feature:"):
                    uses[here].add(there[7:])
                if u.name and not here.startswith(("test", "tooling")):
                    door[there].add(u.name)
                    door_from[there][u.target] += 1
        for l in reader_of(f).links(f, index):
            if l.target and l.target in kind and unit(l.target) != here:
                there = unit(l.target)
                touched[f.name].setdefault(there, 0)
                if here.startswith("feature:") and there.startswith("module:"):
                    uses[here].add(there[7:])

    has_door = {unit(f.name) for f in files if have[f.name] and have[f.name].door is not None}
    for uid, fs in sorted(members.items()):
        k = uid.split(":")[0]
        new = [f for f in fs if f.rel in mine]
        if not new:
            continue
        name = uid.split(":", 1)[1] if ":" in uid else ""
        for f in new:
            if k == "feature":
                out[f.rel].append("feature {} in {}".format(name, kind[f.name][2]))
            elif k == "page":
                out[f.rel].append("page " + name)
            elif k == "design":
                out[f.rel].append("design system")
            elif k in ("module", "component", "tooling"):
                out[f.rel].append(k + (" " + name if name else ""))
        if k == "module" and uid not in has_door:
            names = set(seed.get(name, {}).get("front_door", [])) or door[uid]
            # the door goes on the folder's own index file, else where most names come from
            heads = [f for f in new if f.path.stem in ("__init__", "index")]
            best = heads[0] if heads else max(new, key=lambda f: (door_from[uid][f.name], -len(f.rel)))
            out[best.rel].append("front door " + (", ".join(sorted(names)) or "none"))
        if k == "feature":
            first = new[0]
            if uses[uid]:
                out[first.rel].append("uses " + ", ".join(sorted(uses[uid])))

    # tests: of a feature, of the UI, or of the module they touch most
    for f in todo:
        if kind[f.name][0] != "test":
            continue
        text = _text(f)
        hit = touched[f.name]
        feats = [u for u in hit if u.startswith("feature:")]
        mods = sorted((u for u in hit if u.startswith("module:")), key=lambda u: -hit[u])
        if any(h in text for h in UI_TEST_HINTS) or any(
                p in ("e2e", "playwright", "cypress") for p in f.rel.split("/")):
            out[f.rel].append("test ui")
        elif feats:
            out[f.rel].append("test feature " + sorted(feats)[0][8:])
        elif mods:
            out[f.rel].append("test module " + mods[0][7:])
        else:
            out[f.rel].append("test ui")

    # stores: each table or collection the modules reach, owned by the one
    # that writes it most, its tag on the schema where the owner holds one
    calls: dict = defaultdict(lambda: defaultdict(lambda: [0, None]))
    declared = {s for f in files if have[f.name] for s, _, _ in have[f.name].stores}
    for f in files:
        uid = unit(f.name)
        if not uid.startswith("module:"):
            continue
        for name, how, line in store_calls(_text(f)):
            c = calls[name][uid]
            c[0] += 2 if how == "writes" else 1
            c[1] = c[1] or f
    schemas: list = []
    for f in files:
        schemas += shapes.schemas_in(f.rel, _text(f))
    for name in sorted(calls):
        if name in declared:
            continue
        by = calls[name]
        owner_uid = max(by, key=lambda u: (by[u][0], u))
        found = shapes.find(schemas, name)
        place = next((f for f in members[owner_uid] if found and f.rel == found.rel), by[owner_uid][1])
        if place.rel in out:
            out[place.rel].append("store " + name)
        for reader_uid in sorted(set(by) - {owner_uid}):
            f = by[reader_uid][1]
            if f.rel in out:
                out[f.rel].append("reads " + name)

    # the start page: the one at /, else one called home, app or index
    page_rels = {rel: lines for rel, lines in out.items() if lines and lines[0].startswith("page ")}
    if page_rels and not any(have[f.name] and have[f.name].start for f in files):
        start = next((r for r in sorted(page_rels) if route_of(r) == "/"), None) or \
            next((r for r in sorted(page_rels) if page_rels[r][0].split()[1] in
                  ("home", "app", "index")), None)
        if start:
            out[start][0] = "start " + out[start][0]
    return {rel: lines for rel, lines in out.items() if lines}


def as_tags(drafts: dict) -> dict:
    """The draft read back as tags, for drawing a codebase nobody has tagged."""
    return {rel: read_tags("\n".join("# codegraph: " + l for l in lines))
            for rel, lines in drafts.items()}


def insert_tags(text: str, lines: list, comment: str) -> str:
    """Put tag lines at the top of a file's text: after a #! line, a Python
    coding line, or the "use client" a framework needs first."""
    nl = "\r\n" if "\r\n" in text else "\n"
    rows = text.splitlines(keepends=True)
    i = 1 if rows and rows[0].startswith("#!") else 0
    if comment == "#" and i < len(rows) and re.match(r"#.*coding[:=]", rows[i]):
        i += 1
    while comment == "//" and i < len(rows) and \
            re.match(r"""\s*(["'])use (client|server|strict)\1;?\s*$""", rows[i]):
        i += 1
    block = "".join("{} codegraph: {}{}".format(comment, l, nl) for l in lines)
    return "".join(rows[:i]) + block + "".join(rows[i:])


def write_drafts(root: Path, drafts: dict) -> None:
    for rel, lines in drafts.items():
        path = root / rel
        text = path.read_text(encoding="utf-8")
        comment = "#" if rel.endswith(".py") else "//"
        path.write_text(insert_tags(text, lines, comment), encoding="utf-8", newline="")


def tagged_at_all(root: Path, hidden: bool = False) -> bool:
    return any(file_tags(f) is not None for f in files_in(root, hidden))


# ------------------------------------------------------------- for the mod
#
# The mod beside the chat reads a summary, not the page: the systems and
# their features, the modules, pages and stores, the mismatches, and a small
# picture of the map.

def summary(graph: dict) -> dict:
    m = graph.get("map") or {}
    nodes = (m.get("views") or {}).get("map", {}).get("nodes", [])
    by_kind: dict = defaultdict(list)
    for n in nodes:
        by_kind[n["kind"]].append(n)
    systems: dict = defaultdict(list)
    triggers = defaultdict(list)
    for t in by_kind["trigger"]:
        triggers[t["feature"]].append("{} {}".format(t["dir"], t["label"]))
    for n in sorted(by_kind["feature"], key=lambda n: n["label"]):
        systems[n["system"] or "no system"].append({
            "id": n["id"], "name": n["label"], "uses": n["uses"],
            "triggers": triggers[n["id"]], "files": [_rel_of(graph, i) for i in n["files"]]})
    def brief(n: dict, *keys) -> dict:
        return dict({"id": n["id"], "name": n["label"],
                     "files": [_rel_of(graph, i) for i in n.get("files", [])]},
                    **{k: n.get(k) for k in keys})
    return {
        "root": graph["root"], "source": m.get("source", "none"),
        "systems": [{"name": s, "features": f} for s, f in sorted(systems.items())],
        "modules": [brief(n, "door", "stores", "reads") for n in
                    sorted(by_kind["module"], key=lambda n: n["label"])],
        "pages": [brief(n, "route", "start") for n in sorted(by_kind["page"], key=lambda n: n["label"])],
        "components": [brief(n) for n in sorted(by_kind["component"], key=lambda n: n["label"])],
        "stores": [{"id": n["id"], "name": n["label"], "owner": n["owner"], "fields": n["fields"]}
                   for n in sorted(by_kind["store"], key=lambda n: n["label"])],
        "mismatches": m.get("mismatches", []), "unknown": m.get("unknown", []),
        "svg": map_svg(m["views"]["map"]) if m else "",
    }


def _rel_of(graph: dict, fid: str) -> str:
    n = next((n for n in graph["nodes"] if n["id"] == fid), None)
    return (n["dir"] + "/" + n["label"] if n and n["dir"] != "." else n["label"]) if n else fid


SVG_HUES = {"module": 210, "feature": 150, "page": 280, "component": 300, "design": 30,
            "store": 175, "trigger": 45, "outside": 0, "loose": 0}


def map_svg(view: dict, limit: int = 120000) -> str:
    """The map as one plain SVG picture: cards in their columns, wires as
    curves, red where a rule is broken. Empty if it would be too big to send."""
    W, H, GX, GY = 150, 34, 70, 12
    cols: dict = defaultdict(list)
    for n in view["nodes"]:
        cols[n["col"]].append(n)
    tallest = max((len(v) for v in cols.values()), default=1)
    at = {}
    for c, ns in cols.items():
        ns.sort(key=lambda n: n["row"])
        top = (tallest - len(ns)) * (H + GY) / 2
        for i, n in enumerate(ns):
            at[n["id"]] = (c * (W + GX) + 10, top + i * (H + GY) + 10)
    width = (max(cols, default=0) + 1) * (W + GX) + 20
    height = tallest * (H + GY) + 20
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" font-family="system-ui,'
           'sans-serif" font-size="11">'.format(int(width), int(height))]
    for e in view["edges"]:
        if e["from"] not in at or e["to"] not in at:
            continue
        (x1, y1), (x2, y2) = at[e["from"]], at[e["to"]]
        if x1 < x2:
            a, b = (x1 + W, y1 + H / 2), (x2, y2 + H / 2)
        elif x1 > x2:
            a, b = (x1, y1 + H / 2), (x2 + W, y2 + H / 2)
        else:                                   # one column: loop out to the right
            a, b = (x1 + W, y1 + H / 2), (x2 + W, y2 + H / 2)
        bad = e.get("bad") or e.get("why")
        hue = KINDS.get(e["kind"], {}).get("hue")
        colour = "#d33" if bad else ("hsl({},55%,55%)".format(hue) if hue is not None else "#999")
        bend = max(30, abs(b[0] - a[0]) * 0.45)
        da, db = (1, -1) if x1 < x2 else (-1, 1) if x1 > x2 else (1, 1)
        out.append('<path d="M{:.0f} {:.0f} C{:.0f} {:.0f} {:.0f} {:.0f} {:.0f} {:.0f}" fill="none" '
                   'stroke="{}" stroke-width="{}" opacity="0.8"/>'.format(
                       a[0], a[1], a[0] + da * bend, a[1], b[0] + db * bend, b[1], b[0], b[1],
                       colour, 2 if bad else 1.2))
    for n in view["nodes"]:
        x, y = at[n["id"]]
        hue = SVG_HUES.get(n["kind"], 0)
        sat = "0%" if n["kind"] in ("outside", "loose", "file", "external") else "55%"
        label = n["label"] if len(n["label"]) <= 22 else n["label"][:21] + "…"
        out.append('<rect x="{:.0f}" y="{:.0f}" width="{}" height="{}" rx="{}" fill="hsl({},{},55%)" '
                   'fill-opacity="0.18" stroke="hsl({},{},50%)"/>'.format(
                       x, y, W, H, 12 if n["kind"] == "feature" else 5, hue, sat, hue, sat))
        out.append('<text x="{:.0f}" y="{:.0f}" fill="hsl({},{},45%)" font-weight="600">{}</text>'
                   .format(x + 8, y + 15, hue, sat, _xml(label)))
        out.append('<text x="{:.0f}" y="{:.0f}" fill="#888" font-size="9">{}</text>'.format(
            x + 8, y + 27, _xml(n["kind"] if n["kind"] != "outside" else "outside")))
    out.append("</svg>")
    svg = "".join(out)
    return svg if len(svg) <= limit else ""


def _xml(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


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
        description="Draw a codebase as modules, features and UI, and check it against its tags.",
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
                    help="read the code against its tags; exit 1 on a mismatch")
    ap.add_argument("--draft", action="store_true",
                    help="write a first tag into every file that has none")
    ap.add_argument("--summary", action="store_true",
                    help="print what the mod beside the chat shows, as JSON")
    args = ap.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        ap.error(str(root) + " is not a folder")

    if args.draft:
        drafts = draft_tags(root, hidden=args.hidden)
        write_drafts(root, drafts)
        counts: dict = defaultdict(int)
        for lines in drafts.values():
            counts[lines[0].split()[0] if not lines[0].startswith("start") else "page"] += 1
        print("tagged {} files: {}".format(len(drafts), ", ".join(
            "{} {}".format(n, k) for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))))
        print("Every front door holds what crosses today. Narrow each to what should "
              "cross, correct any guess, then run --check.")
        if (root / DECLARATION).exists():
            print("{} seeded the modules; the tags replace it, so it can go.".format(DECLARATION))
        return 0
    if args.check:
        report = check(root, hidden=args.hidden)
        for m in report.mismatches:
            print(m)
        if report.unknown:
            print("cannot tell:")
            for u in report.unknown:
                print("    " + str(u))
        print("{} mismatches, {} cannot tell".format(
            len(report.mismatches), len(report.unknown)))
        return 1 if report.mismatches else 0

    # The map comes from the tags, or failing that from a draft of them,
    # which the page labels as a draft.
    drafted, source = None, "tags"
    if not tagged_at_all(root, args.hidden):
        drafted, source = as_tags(draft_tags(root, args.hidden)), "draft"
    reading = read_map(root, args.hidden, drafted)

    graph = build(root, externals=args.externals, hidden=args.hidden,
                  outside=args.outside, layout=args.layout,
                  keep_empty=args.keep_empty, reading=reading, source=source)

    if args.summary:
        print(json.dumps(summary(graph)))
        return 0
    if args.json:
        print(json.dumps(graph, indent=2))
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
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

    mv = graph["map"]
    kinds = defaultdict(int)
    for n in mv["views"]["map"]["nodes"]:
        kinds[n["kind"]] += 1
    print("{} ({}): {} mismatches, {} cannot tell".format(
        ", ".join("{} {}".format(kinds[k], k) for k in
                  ("module", "feature", "page", "component", "store") if kinds[k]) or "nothing",
        "read from tags" if source == "tags" else "drafted, nothing tagged yet",
        len(mv["mismatches"]), len(mv["unknown"])))

    seen = list(graph["externals_seen"])[:6]
    if seen:
        more = "" if args.externals else "   (--externals draws these too)"
        print("third party seen: " + ", ".join(seen) + more)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
