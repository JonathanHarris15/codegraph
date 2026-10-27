# codegraph: module source
from __future__ import annotations

import ast
import sys
from dataclasses import dataclass

from .files import Link, Use, file_of
from .outside import dotted_name, read_outside


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
