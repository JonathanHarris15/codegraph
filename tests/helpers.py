# codegraph: tooling
"""Writing small codebases for the tests to read."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from modules.source.readers import READERS


HAS_SCRIPT = any(r.lang == "script" for r in READERS)


def tree(root: Path, files: dict) -> None:
    """Write {relative path: source} under root."""
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def mod(name: str, door: str | None = None) -> str:
    """The tag lines for a file of module `name`, with its front door if given."""
    return "# codegraph: module {}\n".format(name) + (
        "# codegraph: front door {}\n".format(door) if door is not None else "")


class Folder(unittest.TestCase):
    """A fresh folder to write a small codebase into."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def has(self, found, *words) -> bool:
        return any(all(w in m.text for w in words) for m in found)
