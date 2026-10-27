# codegraph: module source
from __future__ import annotations


from .files import discover
from .python import PythonReader
from .scripts import ScriptReader


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
