"""Tests for the part that can be quietly wrong: turning a path and an import
statement into the name of another file.

Standard library only:  python -m unittest -v
"""
from __future__ import annotations

import ast
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

import codegraph as cg


def tree(root: Path, files: dict) -> None:
    """Write {relative path: source} under root."""
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


class FileNames(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def name_of(self, rel: str) -> cg.File:
        tree(self.root, {rel: ""})
        return cg.file_of(self.root / rel, self.root)

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
        self.assertEqual(cg.file_of(self.root / "a.py", self.root).lines, 2)


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


class Layering(unittest.TestCase):
    """Columns by import depth: one past the furthest thing that imports you."""

    def test_a_chain_spreads_across_columns(self):
        col = cg.layer(["a", "b", "c"], [("a", "b"), ("b", "c")])
        self.assertEqual([col["a"], col["b"], col["c"]], [0, 1, 2])

    def test_the_longest_path_wins(self):
        # a -> b -> c and a -> c: c sits past b, not beside it
        col = cg.layer(["a", "b", "c"], [("a", "b"), ("b", "c"), ("a", "c")])
        self.assertEqual(col["c"], 2)

    def test_entry_points_share_the_first_column(self):
        col = cg.layer(["cli", "app", "models"],
                       [("cli", "models"), ("app", "models")])
        self.assertEqual(col["cli"], 0)
        self.assertEqual(col["app"], 0)

    def test_an_entry_point_and_a_leaf_no_longer_collide(self):
        col = cg.layer(["cli", "models"], [("cli", "models")])
        self.assertNotEqual(col["cli"], col["models"])

    def test_a_loop_is_broken_not_fatal(self):
        col = cg.layer(["a", "b"], [("a", "b"), ("b", "a")])
        self.assertEqual(sorted(col), ["a", "b"])

    def test_back_edges_are_the_ones_closing_a_loop(self):
        self.assertEqual(cg.back_edges(["a", "b"], [("a", "b"), ("b", "a")]),
                         {("b", "a")})

    def test_a_diamond_has_no_back_edge(self):
        pairs = [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]
        self.assertEqual(cg.back_edges(list("abcd"), pairs), set())


class RowOrder(unittest.TestCase):
    def test_rows_are_a_full_run_per_column(self):
        cols = {0: ["a", "b"], 1: ["c", "d", "e"]}
        rows = cg.order_rows(cols, [("a", "c"), ("b", "d")])
        self.assertEqual(sorted(rows[n] for n in cols[0]), [0, 1])
        self.assertEqual(sorted(rows[n] for n in cols[1]), [0, 1, 2])

    def test_a_card_moves_level_with_what_it_is_wired_to(self):
        # x is wired to the last card of column 0, so it should not stay first
        cols = {0: ["a", "b", "c"], 1: ["x", "y"]}
        rows = cg.order_rows(cols, [("c", "x"), ("a", "y")])
        self.assertGreater(rows["x"], rows["y"])


class Placement(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "app/__init__.py": "",
            "app/cli.py": "from core.models import Bar\nfrom app.work import go\n",
            "app/work.py": "from core.models import Bar\n",
            "core/__init__.py": "",
            "core/models.py": "import sqlite3\nc = sqlite3.connect('a.db')\n",
        })

    def test_every_card_is_placed(self):
        g = cg.build(self.root)
        for n in g["nodes"]:
            self.assertIsInstance(n["col"], int)
            self.assertIsInstance(n["row"], int)

    def test_what_is_imported_sits_left_of_what_imports_it(self):
        # so every wire, drawn as flowing into the importer, runs rightward
        g = cg.build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        for e in g["edges"]:
            if e["kind"] in ("import", "lazy"):
                self.assertLess(col[e["to"]], col[e["from"]],
                                "%s -> %s" % (e["from"], e["to"]))

    def test_the_entry_point_is_right_of_the_leaf(self):
        g = cg.build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        self.assertGreater(col["app.cli"], col["app.work"])
        self.assertGreater(col["app.work"], col["core.models"])

    def test_outside_cards_get_the_first_column(self):
        g = cg.build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        self.assertEqual(col["svc:sqlite"], 0)
        self.assertEqual(g["columns"][0]["label"], "outside")

    def test_no_column_claims_to_be_entry_points(self):
        # nothing importing a file can mean it is run, loaded by name or dead,
        # so the column does not pretend to know which
        labels = [c["label"] for c in cg.build(self.root)["columns"]]
        self.assertNotIn("entry points", labels)

    def test_rows_within_a_column_are_distinct(self):
        g = cg.build(self.root)
        per = defaultdict(list)
        for n in g["nodes"]:
            per[n["col"]].append(n["row"])
        for col, rows in per.items():
            self.assertEqual(sorted(rows), list(range(len(rows))))

    def test_empty_init_files_are_dropped(self):
        ids = {n["id"] for n in cg.build(self.root)["nodes"]}
        self.assertNotIn("app", ids)
        self.assertIn("app", {n["id"] for n in
                              cg.build(self.root, keep_empty=True)["nodes"]})

    def test_folder_layout_still_works(self):
        g = cg.build(self.root, layout="folder")
        self.assertEqual(g["layout"], "folder")
        cols = {n["id"]: n["col"] for n in g["nodes"]}
        self.assertEqual(cols["app.cli"], cols["app.work"])   # same folder
        self.assertGreater(cols["app.cli"], cols["core.models"])
        self.assertEqual(cols["svc:sqlite"], 0)


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


class FrontDoors(unittest.TestCase):
    """The check: a declaration says which names may cross a module's front
    door, and the code is read back against it."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "engine/__init__.py": "",
            "engine/book.py": "class Book: pass\ndef _fill(): pass\n",
            "app/__init__.py": "",
        })
        self.decl = {"modules": {
            "engine": {"files": ["engine/*"], "front_door": ["Book"]},
            "app": {"files": ["app/*"], "front_door": []},
        }}

    def check(self, files: dict, decl: dict | None = None):
        tree(self.root, files)
        return cg.check(self.root, decl or self.decl)

    def texts(self, found) -> list:
        return [m.text for m in found]

    def test_a_front_door_name_passes(self):
        r = self.check({"app/main.py": "from engine.book import Book\n"})
        self.assertEqual(r.mismatches, [])

    def test_a_name_behind_the_door_is_a_mismatch(self):
        r = self.check({"app/main.py": "from engine.book import _fill\n"})
        self.assertEqual(len(r.mismatches), 1)
        m = r.mismatches[0]
        self.assertEqual((m.rel, m.line), ("app/main.py", 1))
        self.assertIn("_fill", m.text)
        self.assertIn("engine", m.text)

    def test_the_path_an_import_takes_does_not_matter(self):
        r = self.check({
            "engine/__init__.py": "from .book import Book\n",
            "app/main.py": "from engine import Book\n",
        })
        self.assertEqual(r.mismatches, [])

    def test_a_name_reached_through_an_alias(self):
        r = self.check({"app/main.py": "import engine.book as b\nb._fill()\n"})
        self.assertEqual([(m.line, "_fill" in m.text) for m in r.mismatches], [(2, True)])

    def test_a_name_reached_through_the_full_dotted_path(self):
        r = self.check({"app/main.py": "import engine.book\nengine.book._fill()\n"})
        self.assertEqual(len(r.mismatches), 1)

    def test_a_file_imported_by_name_then_used(self):
        r = self.check({"app/main.py": "from engine import book\nbook._fill()\nbook.Book()\n"})
        self.assertEqual([m.line for m in r.mismatches], [2])

    def test_inside_a_module_anything_goes(self):
        r = self.check({"engine/other.py": "from engine.book import _fill\n"})
        self.assertEqual(r.mismatches, [])

    def test_import_star_is_unknown_not_guessed(self):
        r = self.check({"app/main.py": "from engine.book import *\n"})
        self.assertEqual(r.mismatches, [])
        self.assertEqual(len(r.unknown), 1)

    def test_a_module_passed_around_whole_is_unknown(self):
        r = self.check({"app/main.py": "import engine.book as b\nrun(b)\n"})
        self.assertEqual(r.mismatches, [])
        self.assertEqual([u.line for u in r.unknown], [2])

    def test_third_party_and_stdlib_are_not_checked(self):
        r = self.check({"app/main.py": "import os\nfrom httpx import Client\n"})
        self.assertEqual((r.mismatches, r.unknown), ([], []))

    def test_a_file_in_no_module(self):
        r = self.check({"loose.py": ""})
        self.assertEqual([m.rel for m in r.mismatches], ["loose.py"])
        self.assertIn("no module", r.mismatches[0].text)

    def test_a_file_in_two_modules(self):
        decl = {"modules": {
            "engine": {"files": ["engine/*"], "front_door": ["Book"]},
            "app": {"files": ["app/*", "engine/book.py"], "front_door": []},
        }}
        r = self.check({}, decl)
        self.assertEqual([m.rel for m in r.mismatches], ["engine/book.py"])
        self.assertIn("more than one module", r.mismatches[0].text)

    def test_a_pattern_that_matches_nothing(self):
        decl = {"modules": {
            "engine": {"files": ["engine/*"], "front_door": ["Book"]},
            "app": {"files": ["app/*"], "front_door": []},
            "ghost": {"files": ["ghost/*"], "front_door": []},
        }}
        r = self.check({}, decl)
        self.assertTrue(any("ghost" in t and "no files" in t for t in self.texts(r.mismatches)))

    def test_a_star_stays_in_its_folder(self):
        self.assertTrue(cg.path_match("atp/book.py", "atp/*"))
        self.assertFalse(cg.path_match("atp/engine/book.py", "atp/*"))
        self.assertTrue(cg.path_match("atp/engine/book.py", "atp/**"))
        self.assertTrue(cg.path_match("main.py", "*.py"))
        self.assertFalse(cg.path_match("atp/main.py", "*.py"))

    def test_a_test_is_an_outside_caller(self):
        decl = dict(self.decl, tests={"files": ["tests/*"]})
        r = self.check({"tests/test_book.py": "from engine.book import _fill\n"}, decl)
        self.assertEqual([m.rel for m in r.mismatches], ["tests/test_book.py"])

    def test_a_test_declared_inside_a_module_may_reach_in(self):
        decl = dict(self.decl, tests={"files": ["tests/*"],
                                      "inside": {"tests/test_book.py": "engine"}})
        r = self.check({"tests/test_book.py": "from engine.book import _fill\n"}, decl)
        self.assertEqual(r.mismatches, [])

    def test_a_test_needs_no_module_of_its_own(self):
        decl = dict(self.decl, tests={"files": ["tests/*"]})
        r = self.check({"tests/test_book.py": "from engine.book import Book\n"}, decl)
        self.assertEqual(r.mismatches, [])

    def test_the_program_never_imports_a_test(self):
        decl = dict(self.decl, tests={"files": ["tests/*"]})
        r = self.check({
            "tests/__init__.py": "",
            "tests/helpers.py": "def make(): pass\n",
            "app/main.py": "from tests.helpers import make\n",
        }, decl)
        self.assertTrue(any(m.rel == "app/main.py" and "test" in m.text
                            for m in r.mismatches))

    def test_a_malformed_declaration_says_what_is_wrong(self):
        with self.assertRaises(cg.DeclarationError) as e:
            cg.check(self.root, {"modules": {"engine": {"front_door": []}}})
        self.assertIn("engine", str(e.exception))


class ModuleViews(unittest.TestCase):
    """The page's module view, and the view inside each module, built from
    the same declaration the check reads."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "engine/book.py": "class Book: pass\ndef _fill(): pass\n",
            "engine/gate.py": "from engine.book import _fill\nfrom util.helpers import h\n",
            "util/helpers.py": "def h(): pass\n",
            "app/main.py": (
                "import sqlite3\n"
                "from engine.book import Book, _fill\n"
                "sqlite3.connect('x.db')\n"
            ),
            "tests/test_book.py": "from engine.book import Book\n",
        })
        self.decl = {
            "modules": {
                "engine": {"files": ["engine/*"], "front_door": ["Book"]},
                "app": {"files": ["app/*"], "front_door": []},
                "util": {"files": ["util/*"], "front_door": ["h"]},
            },
            "tests": {"files": ["tests/**"]},
        }
        self.g = cg.build(self.root, decl=self.decl, source="declared")
        self.views = self.g["modules"]["views"]

    def edge(self, view, src, dst):
        return next((e for e in self.views[view]["edges"]
                     if e["from"] == src and e["to"] == dst), None)

    def ids(self, view):
        return {n["id"] for n in self.views[view]["nodes"]}

    def test_one_card_per_module_plus_tests_and_outside(self):
        self.assertEqual(self.ids("modules"),
                         {"mod:engine", "mod:app", "mod:util", "mod:(tests)", "svc:sqlite"})

    def test_a_wire_between_modules_carries_the_names_that_cross(self):
        e = self.edge("modules", "mod:app", "mod:engine")
        self.assertEqual(e["names"], ["Book", "_fill"])
        self.assertEqual(e["bad"], ["_fill"])

    def test_a_wire_knows_which_files_it_comes_from(self):
        # the arrow lands on the importer, so these are the files to point at
        self.assertEqual(self.edge("modules", "mod:app", "mod:engine")["via"], ["app.main"])
        self.assertEqual(self.edge("modules", "mod:app", "svc:sqlite")["via"], ["app.main"])
        self.assertEqual(self.edge("mod:engine", "mod:app", "engine.book")["via"], ["app.main"])

    def test_a_wire_from_a_file_needs_no_via(self):
        self.assertEqual(self.edge("mod:engine", "engine.gate", "engine.book")["via"], [])

    def test_a_clean_wire_has_nothing_bad(self):
        self.assertEqual(self.edge("modules", "mod:(tests)", "mod:engine")["bad"], [])

    def test_outside_connections_rise_to_the_module(self):
        self.assertEqual(self.edge("modules", "mod:app", "svc:sqlite")["kind"], "database")

    def test_wires_inside_a_module_do_not_show_at_module_level(self):
        self.assertIsNone(self.edge("modules", "mod:engine", "mod:engine"))

    def test_inside_a_module_its_files_and_its_neighbours(self):
        self.assertEqual(self.ids("mod:engine"),
                         {"engine.book", "engine.gate", "mod:app", "mod:util", "mod:(tests)"})

    def cols(self, view):
        return {n["id"]: n["col"] for n in self.views[view]["nodes"]}

    def own_cols(self, view):
        return [n["col"] for n in self.views[view]["nodes"] if n.get("own")]

    def test_inside_a_module_its_own_files_are_marked(self):
        own = {n["id"] for n in self.views["mod:engine"]["nodes"] if n.get("own")}
        self.assertEqual(own, {"engine.book", "engine.gate"})

    def test_modules_it_uses_sit_left_of_its_files(self):
        col = self.cols("mod:engine")
        self.assertLess(col["mod:util"], min(self.own_cols("mod:engine")))
        self.assertEqual(self.views["mod:engine"]["columns"][col["mod:util"]]["label"], "uses")

    def test_modules_that_use_it_sit_right_of_its_files(self):
        col = self.cols("mod:engine")
        for m in ("mod:app", "mod:(tests)"):
            self.assertGreater(col[m], max(self.own_cols("mod:engine")), m)
        self.assertEqual(self.views["mod:engine"]["columns"][col["mod:app"]]["label"], "used by")

    def test_outside_connections_sit_furthest_left(self):
        col = self.cols("mod:app")
        self.assertEqual(col["svc:sqlite"], 0)
        self.assertLess(col["svc:sqlite"], col["mod:engine"])
        self.assertLess(col["mod:engine"], min(self.own_cols("mod:app")))

    def test_inside_a_module_the_bad_wire_lands_on_the_file(self):
        self.assertEqual(self.edge("mod:engine", "mod:app", "engine.book")["bad"], ["_fill"])
        self.assertEqual(self.edge("mod:engine", "engine.gate", "engine.book")["bad"], [])

    def test_every_view_is_placed_and_closed(self):
        for name, view in self.views.items():
            ids = self.ids(name)
            for n in view["nodes"]:
                self.assertIn("col", n, name)
            for e in view["edges"]:
                self.assertIn(e["from"], ids, name)
                self.assertIn(e["to"], ids, name)

    def test_the_card_says_what_the_module_is(self):
        card = next(n for n in self.views["modules"]["nodes"] if n["id"] == "mod:engine")
        self.assertEqual(card["files"], ["engine.book", "engine.gate"])
        self.assertEqual(card["door"], ["Book"])

    def test_the_mismatches_travel_with_the_page(self):
        self.assertEqual(self.g["modules"]["source"], "declared")
        self.assertEqual(len(self.g["modules"]["mismatches"]), 1)

    def test_no_declaration_no_module_views(self):
        self.assertNotIn("modules", cg.build(self.root))


class Drafting(unittest.TestCase):
    """A first declaration, made from what the code does today."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {
            "engine/__init__.py": "",
            "engine/book.py": "class Book: pass\ndef _fill(): pass\n",
            "engine/gate.py": "from engine.book import _fill\n",
            "app/__init__.py": "",
            "app/main.py": "from engine.book import Book\n",
            "tests/test_book.py": "from engine.book import _fill\n",
        })
        self.decl = cg.draft(self.root)

    def test_one_module_per_folder(self):
        self.assertEqual(sorted(self.decl["modules"]), ["app", "engine"])
        self.assertEqual(self.decl["modules"]["engine"]["files"], ["engine/*"])

    def test_the_front_door_is_what_the_program_uses_today(self):
        self.assertEqual(self.decl["modules"]["engine"]["front_door"], ["Book"])

    def test_tests_are_found_by_their_names(self):
        self.assertEqual(self.decl["tests"]["files"], ["tests/**"])
        self.assertNotIn("tests", self.decl["modules"])

    def test_the_draft_passes_except_where_tests_reach_in(self):
        r = cg.check(self.root, self.decl)
        self.assertEqual([m.rel for m in r.mismatches], ["tests/test_book.py"])


if __name__ == "__main__":
    unittest.main()
