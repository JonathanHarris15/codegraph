# codegraph: test ui command-line
"""The command line, run the way a person runs it: draft the tags, check
them, then draw the page and the pane's summary."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
import urllib.request
from pathlib import Path

from tests.helpers import Folder, mod, tree

CODEGRAPH = Path(__file__).resolve().parent.parent / "codegraph.py"


class CommandLine(Folder):
    def run_it(self, *args) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(CODEGRAPH), str(self.root), *args],
                              capture_output=True, text=True, encoding="utf-8")

    def test_draft_then_check(self):
        tree(self.root, {
            "engine/__init__.py": "from engine.book import Book\n",
            "engine/book.py": "class Book: pass\n",
            "app/main.py": "from engine import Book\n",
        })
        drafted = self.run_it("--draft")
        self.assertEqual(drafted.returncode, 0, drafted.stderr)
        self.assertIn("tagged 3 files", drafted.stdout)
        self.assertIn("codegraph:", (self.root / "engine/book.py").read_text(encoding="utf-8"))

        checked = self.run_it("--check")
        self.assertIn("mismatches", checked.stdout.splitlines()[-1])

    def test_check_passes_on_a_true_tag_and_fails_on_a_false_one(self):
        tree(self.root, {
            "engine/__init__.py": mod("engine", "Book") + "class Book: pass\n",
            "engine/gate.py": mod("engine", None) + "def _open(): pass\n",
        })
        good = self.run_it("--check")
        self.assertEqual(good.returncode, 0, good.stdout + good.stderr)
        self.assertIn("0 mismatches", good.stdout)

        tree(self.root, {"tools/peek.py": mod("tools", "") + "from engine.gate import _open\n"})
        bad = self.run_it("--check")
        self.assertEqual(bad.returncode, 1)
        self.assertIn("_open", bad.stdout)
        self.assertIn("not on its front door", bad.stdout)

    def test_the_page_and_the_summary(self):
        tree(self.root, {
            "engine/__init__.py": mod("engine", "Book") + "class Book: pass\n",
            "features/lend.py": ("# codegraph: feature lend in library\n# codegraph: uses engine\n"
                                 "# codegraph: schedule every day\nfrom engine import Book\n"),
        })
        page = self.root / "out" / "map.html"
        drawn = self.run_it("-o", str(page))
        self.assertEqual(drawn.returncode, 0, drawn.stderr)
        self.assertIn("1 module, 1 feature", drawn.stdout)
        html = page.read_text(encoding="utf-8")
        self.assertNotIn("/*__GRAPH__*/null", html)
        self.assertIn('"feature:lend"', html)

        said = self.run_it("--summary")
        self.assertEqual(said.returncode, 0, said.stderr)
        summary = json.loads(said.stdout)
        self.assertEqual(summary["source"], "tags")
        self.assertEqual([s["name"] for s in summary["systems"]], ["library"])
        self.assertEqual(summary["systems"][0]["features"][0]["uses"], ["engine"])


    def test_serve_prints_where_the_page_is_then_what_it_asks(self):
        tree(self.root, {"engine/__init__.py": mod("engine", "Book") + "class Book: pass\n"})
        child = subprocess.Popen([sys.executable, str(CODEGRAPH), str(self.root), "--serve"],
                                 stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.addCleanup(child.wait, 10)
        self.addCleanup(child.kill)
        url = json.loads(child.stdout.readline())["ready"]
        req = urllib.request.Request(url + "ask", data=b'{"text": "/codegraph:fix all"}', method="POST")
        urllib.request.urlopen(req, timeout=10).close()
        self.assertEqual(json.loads(child.stdout.readline()), {"ask": "/codegraph:fix all"})


if __name__ == "__main__":
    unittest.main()
