# codegraph: module rules
from __future__ import annotations

import ast
import re

from modules.source import reader_of


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
