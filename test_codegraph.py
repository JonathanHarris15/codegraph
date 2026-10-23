"""Tests for the part that can be quietly wrong: turning a path and an import
statement into the name of another file.

Standard library only:  python -m unittest -v
"""
from __future__ import annotations

import ast
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


class Symbols(unittest.TestCase):
    """Following a file's own imports, so a probe matches however it was written."""

    def syms(self, src):
        return cg.symbol_table(ast.parse(src))

    def test_plain_import(self):
        self.assertEqual(self.syms("import httpx")["httpx"], "httpx")

    def test_dotted_import_binds_the_root(self):
        self.assertEqual(self.syms("import a.b.c")["a"], "a")

    def test_alias(self):
        self.assertEqual(self.syms("import numpy as np")["np"], "numpy")

    def test_from_import_keeps_the_whole_path(self):
        syms = self.syms("from alpaca.trading.client import TradingClient")
        self.assertEqual(syms["TradingClient"], "alpaca.trading.client.TradingClient")

    def test_relative_import_is_not_a_library(self):
        self.assertEqual(self.syms("from .models import Bar"), {})

    def test_the_same_call_written_two_ways(self):
        a = cg.through_imports("Client", self.syms("from httpx import Client"))
        b = cg.through_imports("httpx.Client", self.syms("import httpx"))
        self.assertEqual(a, b)
        self.assertEqual(cg.match_probe(a), cg.match_probe(b))


class Probes(unittest.TestCase):
    def kind(self, name):
        hit = cg.match_probe(name)
        return hit[0] if hit else None

    def test_sqlite(self):
        self.assertEqual(self.kind("sqlite3.connect"), "database")

    def test_http_clients(self):
        self.assertEqual(self.kind("httpx.Client"), "http")
        self.assertEqual(self.kind("requests.post"), "http")

    def test_a_wildcard_matches_the_family(self):
        self.assertEqual(self.kind("alpaca.data.historical.CryptoHistoricalDataClient"),
                         "market")

    def test_ordinary_calls_are_not_connections(self):
        self.assertIsNone(self.kind("json.dumps"))
        self.assertIsNone(self.kind("self.book.apply"))


class Outside(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def conns(self, src):
        path = self.root / "m.py"
        path.write_text(src, encoding="utf-8")
        return {c.target: c for c in cg.read_outside(path)}

    def test_a_url_becomes_its_host(self):
        c = self.conns('URL = "https://api.example.com/v1/go"')["net:api.example.com"]
        self.assertEqual(c.kind, "http")
        self.assertEqual(c.detail, "https /v1/go")

    def test_the_port_stays_with_the_host(self):
        self.assertIn("net:127.0.0.1:8787", self.conns('u = "http://127.0.0.1:8787"'))

    def test_a_database_url_is_a_database(self):
        c = self.conns('DSN = "postgresql://db.example.com/app"')["net:db.example.com"]
        self.assertEqual(c.kind, "database")

    def test_the_library_decides_what_a_url_is_for(self):
        # feedparser means these are feeds, whatever the scheme says
        got = self.conns(
            "import feedparser\n"
            'FEEDS = ["https://news.example.com/rss"]\n'
            "def pull():\n"
            "    return [feedparser.parse(f) for f in FEEDS]\n"
        )
        self.assertEqual(got["net:news.example.com"].kind, "feed")
        self.assertNotIn("svc:feedparser", got)   # folded into the host

    def test_a_named_service_needs_no_url(self):
        c = self.conns("import sqlite3\nc = sqlite3.connect('a.db')")["svc:sqlite"]
        self.assertEqual(c.kind, "database")

    def test_a_client_with_no_url_names_the_library(self):
        c = self.conns("import httpx\nc = httpx.Client(base_url=cfg.url)")["svc:httpx"]
        self.assertEqual(c.kind, "http")
        self.assertIn("not in the source", c.detail)

    def test_a_server_does_not_claim_a_missing_destination(self):
        c = self.conns("from fastapi import FastAPI\napp = FastAPI()")["svc:fastapi"]
        self.assertEqual(c.kind, "serves")
        self.assertNotIn("not in the source", c.detail)

    def test_environment_by_call_and_by_subscript(self):
        self.assertIn("env:environment", self.conns("import os\nk = os.getenv('K')"))
        self.assertIn("env:environment", self.conns("import os\nk = os.environ['K']"))

    def test_a_file_that_touches_nothing_outside(self):
        self.assertEqual(self.conns("def add(a, b):\n    return a + b\n"), {})

    def test_prose_is_not_a_url(self):
        self.assertEqual(self.conns('"""See the docs. Ratio is 3:1."""'), {})


class OutsideInTheGraph(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "app/__init__.py": "",
            "app/client.py": (
                "import httpx\n"
                'URL = "https://api.example.com/v1"\n'
                "c = httpx.Client(base_url=URL)\n"
            ),
            "app/store.py": "import sqlite3\nc = sqlite3.connect('a.db')\n",
        })

    def test_endpoints_become_cards_in_their_own_column(self):
        g = cg.build(self.root)
        outs = [n for n in g["nodes"] if n["kind"] == "outside"]
        self.assertEqual({n["id"] for n in outs},
                         {"net:api.example.com", "svc:sqlite"})
        self.assertEqual(g["groups"][-1], cg.OUTSIDE)

    def test_the_wires_point_from_the_file_that_makes_them(self):
        g = cg.build(self.root)
        pairs = {(e["from"], e["to"]): e["kind"] for e in g["edges"]}
        self.assertEqual(pairs[("app.client", "net:api.example.com")], "http")
        self.assertEqual(pairs[("app.store", "svc:sqlite")], "database")

    def test_only_the_kinds_in_use_are_published(self):
        self.assertEqual(set(cg.build(self.root)["kinds"]), {"http", "database"})

    def test_no_outside_leaves_imports_alone(self):
        g = cg.build(self.root, outside=False)
        self.assertEqual([n for n in g["nodes"] if n["kind"] == "outside"], [])
        self.assertNotIn(cg.OUTSIDE, g["groups"])


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
