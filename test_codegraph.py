"""Tests for the part that can be quietly wrong: turning a path and an import
statement into the name of another file.

Standard library only:  python -m unittest -v
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import codegraph as cg


def tree(root: Path, files: dict) -> None:
    """Write {relative path: source} under root."""
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


class ModuleNames(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def name_of(self, rel: str) -> cg.Module:
        tree(self.root, {rel: ""})
        return cg.module_of(self.root / rel, self.root)

    def test_nested_file(self):
        m = self.name_of("pkg/sub/thing.py")
        self.assertEqual(m.name, "pkg.sub.thing")
        self.assertEqual(m.package, "pkg.sub")
        self.assertEqual(m.group, "pkg/sub")

    def test_init_is_the_package(self):
        m = self.name_of("pkg/sub/__init__.py")
        self.assertEqual(m.name, "pkg.sub")
        self.assertEqual(m.package, "pkg.sub")

    def test_file_at_the_root(self):
        m = self.name_of("setup.py")
        self.assertEqual(m.name, "setup")
        self.assertEqual(m.package, "")
        self.assertEqual(m.group, ".")

    def test_lines_are_counted(self):
        tree(self.root, {"a.py": "x = 1\ny = 2\n"})
        self.assertEqual(cg.module_of(self.root / "a.py", self.root).lines, 2)


class RelativeImports(unittest.TestCase):
    """`from ..x import y` written inside pkg.sub.thing."""

    def abs_of(self, module, level, package="pkg.sub"):
        imp = cg.RawImport(module, (), level, False)
        return cg.absolute(imp, package)

    def test_absolute_is_left_alone(self):
        self.assertEqual(self.abs_of("other.mod", 0), "other.mod")

    def test_one_dot_is_the_package(self):
        self.assertEqual(self.abs_of("thing", 1), "pkg.sub.thing")

    def test_bare_one_dot(self):
        self.assertEqual(self.abs_of(None, 1), "pkg.sub")

    def test_two_dots_climb(self):
        self.assertEqual(self.abs_of("other", 2), "pkg.other")

    def test_climbing_past_the_root_does_not_crash(self):
        self.assertEqual(self.abs_of("x", 9), "x")


class Resolution(unittest.TestCase):
    index = {"pkg": 1, "pkg.models": 1, "pkg.engine": 1, "pkg.engine.tick": 1,
             "scripts.helpers": 1}

    def test_plain_module(self):
        self.assertEqual(cg.resolve("pkg.models", (), self.index), ["pkg.models"])

    def test_names_that_are_modules_each_count(self):
        hits = cg.resolve("pkg.engine", ("tick", "Book"), self.index)
        self.assertEqual(sorted(hits), ["pkg.engine", "pkg.engine.tick"])

    def test_a_name_that_is_a_class_does_not(self):
        self.assertEqual(cg.resolve("pkg.models", ("Bar",), self.index), ["pkg.models"])

    def test_third_party_misses(self):
        self.assertEqual(cg.resolve("httpx", ("Client",), self.index), [])

    def test_sibling_script_resolves_through_its_folder(self):
        # scripts/run.py saying `import helpers` means the file next door
        self.assertEqual(
            cg.resolve("helpers", (), self.index, package="scripts"),
            ["scripts.helpers"],
        )


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "pkg/__init__.py": "",
            "pkg/models.py": "class Bar: pass\n",
            "pkg/engine.py": (
                "import httpx\n"
                "from pkg.models import Bar\n"
                "def later():\n"
                "    from pkg.util import helper\n"
                "    return helper\n"
            ),
            "pkg/util.py": "from .models import Bar\n",
            ".hidden/tool.py": "from pkg.models import Bar\n",
        })
        self.g = cg.build(self.root)

    def edge(self, src, dst):
        return next((e for e in self.g["edges"]
                     if e["from"] == src and e["to"] == dst), None)

    def test_top_level_import(self):
        self.assertEqual(self.edge("pkg.engine", "pkg.models")["kind"], "import")

    def test_import_inside_a_function_is_lazy(self):
        self.assertEqual(self.edge("pkg.engine", "pkg.util")["kind"], "lazy")

    def test_relative_import_resolves(self):
        self.assertIsNotNone(self.edge("pkg.util", "pkg.models"))

    def test_third_party_is_not_an_edge_but_is_counted(self):
        self.assertIsNone(self.edge("pkg.engine", "ext:httpx"))
        self.assertEqual(self.g["externals_seen"]["httpx"], 1)

    def test_stdlib_is_ignored_entirely(self):
        self.assertNotIn("json", self.g["externals_seen"])

    def test_dotted_folders_are_skipped(self):
        self.assertNotIn(".hidden.tool", [n["id"] for n in self.g["nodes"]])
        self.assertIn(".hidden.tool",
                      [n["id"] for n in cg.build(self.root, hidden=True)["nodes"]])

    def test_externals_become_cards_when_asked(self):
        g = cg.build(self.root, externals=True)
        self.assertIn("ext:httpx", [n["id"] for n in g["nodes"]])
        self.assertEqual(g["groups"][-1], "(external)")

    def test_every_edge_points_at_a_real_node(self):
        ids = {n["id"] for n in self.g["nodes"]}
        for e in self.g["edges"]:
            self.assertIn(e["from"], ids)
            self.assertIn(e["to"], ids)


class GroupOrder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def test_importers_come_first(self):
        tree(self.root, {
            "app/__init__.py": "",
            "app/main.py": "from core.models import Bar\n",
            "core/__init__.py": "",
            "core/models.py": "class Bar: pass\n",
        })
        self.assertEqual(cg.build(self.root)["groups"], ["app", "core"])

    def test_a_cycle_still_produces_an_order(self):
        tree(self.root, {
            "a/__init__.py": "", "a/x.py": "import b.y\n",
            "b/__init__.py": "", "b/y.py": "import a.x\n",
        })
        groups = cg.build(self.root)["groups"]
        self.assertEqual(sorted(groups), ["a", "b"])


if __name__ == "__main__":
    unittest.main()
