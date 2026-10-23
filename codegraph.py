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
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SKIP_DIRS = {
    ".git", ".hg", ".svn", ".venv", "venv", "env", "__pycache__", "node_modules",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".eggs",
    "build", "dist", "site-packages", ".idea", ".vscode",
}

TEMPLATE = Path(__file__).with_name("template.html")


# --------------------------------------------------------------------- model

@dataclass(frozen=True)
class Module:
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


def module_of(path: Path, root: Path) -> Module:
    """Work out the dotted name, folder group and package for one file."""
    rel = path.relative_to(root)
    parts = list(rel.parts)
    stem = parts[-1][:-3]                       # drop .py
    folder = parts[:-1]

    if stem == "__init__":
        name_parts = folder                     # the package IS the module
    else:
        name_parts = folder + [stem]

    return Module(
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
    """Which modules in the index does this import actually reach?

    `from atp.engine import book, gate` reaches two modules; `from atp.models
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


# --------------------------------------------------------------------- build

def build(root: Path, externals: bool = False, hidden: bool = False) -> dict:
    modules = [module_of(p, root) for p in discover(root, hidden)]
    index = {m.name: m for m in modules}

    edges: dict = {}
    ext_hits: dict = defaultdict(int)
    stdlib = getattr(sys, "stdlib_module_names", frozenset())

    def add(src: str, dst: str, kind: str) -> None:
        if src == dst:
            return
        key = (src, dst)
        # a real top-level import beats the same one hidden in a function
        if edges.get(key) == "import":
            return
        edges[key] = kind

    for mod in modules:
        for imp in read_imports(mod.path):
            target = absolute(imp, mod.package)
            kind = "lazy" if imp.nested else "import"
            hits = resolve(target, imp.names, index, mod.package)
            if hits:
                for hit in hits:
                    add(mod.name, hit, kind)
                continue
            top = target.split(".")[0]
            if not top or top in stdlib or top == "__future__":
                continue
            ext_hits[top] += 1
            if externals:
                add(mod.name, "ext:" + top, kind)

    groups = order_groups(modules, edges, externals)
    rank = {g: i for i, g in enumerate(groups)}

    nodes = [
        {
            "id": m.name,
            "label": m.label,
            "dir": m.group,
            "group": m.group,
            "lines": m.lines,
            "kind": "module",
        }
        for m in sorted(modules, key=lambda m: (rank.get(m.group, 0), m.rel))
    ]
    if externals:
        nodes += [
            {
                "id": "ext:" + name,
                "label": name,
                "dir": "third party",
                "group": "(external)",
                "lines": 0,
                "kind": "external",
            }
            for name in sorted(ext_hits)
        ]

    return {
        "root": root.resolve().name,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "groups": groups,
        "nodes": nodes,
        "edges": [
            {"from": s, "to": d, "kind": k}
            for (s, d), k in sorted(edges.items())
        ],
        "externals_seen": dict(sorted(ext_hits.items(), key=lambda kv: (-kv[1], kv[0]))),
    }


def order_groups(modules: list, edges: dict, externals: bool) -> list[str]:
    """Left to right: whoever imports comes before whoever is imported.

    A topological sort of the folders. Cycles get broken by taking the folder
    with the fewest unmet dependents, then by name, so the result is stable.
    """
    group_of = {m.name: m.group for m in modules}
    groups = sorted({m.group for m in modules})

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

    if externals:
        order.append("(external)")
    return order


# -------------------------------------------------------------------- render

def render(graph: dict) -> str:
    html = TEMPLATE.read_text(encoding="utf-8")
    if "/*__GRAPH__*/null" not in html:
        raise SystemExit(str(TEMPLATE) + " has no /*__GRAPH__*/null placeholder")
    return html.replace("/*__GRAPH__*/null", json.dumps(graph, indent=1))


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
    args = ap.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        ap.error(str(root) + " is not a folder")

    graph = build(root, externals=args.externals, hidden=args.hidden)

    if args.json:
        print(json.dumps(graph, indent=2))
        return 0

    args.out.write_text(render(graph), encoding="utf-8")
    mods = sum(1 for n in graph["nodes"] if n["kind"] == "module")
    lazy = sum(1 for e in graph["edges"] if e["kind"] == "lazy")
    print(
        "{} files, {} wires ({} of them imports inside a function), "
        "{} folders -> {}".format(
            mods, len(graph["edges"]), lazy, len(graph["groups"]), args.out
        )
    )
    seen = list(graph["externals_seen"])[:6]
    if seen:
        tail = "" if args.externals else "   (--externals draws these too)"
        print("third party seen: " + ", ".join(seen) + tail)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
