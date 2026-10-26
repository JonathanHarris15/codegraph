"""Tests for the part that can be quietly wrong: turning a path and an import
statement into the name of another file.

Standard library only:  python -m unittest -v
"""
from __future__ import annotations

import ast
import json
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

import codegraph as cg
import shapes

HAS_SCRIPT = any(r.lang == "script" for r in cg.READERS)


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


def mod(name: str, door: str | None = None) -> str:
    """The tag lines for a file of module `name`, with its front door if given."""
    return "# codegraph: module {}\n".format(name) + (
        "# codegraph: front door {}\n".format(door) if door is not None else "")


class Project(unittest.TestCase):
    """A fresh folder to write a small codebase into."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def check(self, files: dict):
        tree(self.root, files)
        return cg.check(self.root)

    def has(self, found, *words) -> bool:
        return any(all(w in m.text for w in words) for m in found)


class Tags(unittest.TestCase):
    """Reading what a file says it belongs to."""

    def test_a_module_and_its_front_door(self):
        t = cg.read_tags("# codegraph: module engine\n# codegraph: front door Book, tick\n")
        self.assertEqual((t.kind, t.name, t.door, t.unit),
                         ("module", "engine", ["Book", "tick"], "module:engine"))

    def test_an_empty_front_door(self):
        self.assertEqual(cg.read_tags("# codegraph: module a\n# codegraph: front door\n").door, [])
        self.assertEqual(cg.read_tags("# codegraph: module a\n# codegraph: front door none\n").door, [])

    def test_a_feature_with_its_system_uses_and_triggers(self):
        t = cg.read_tags("// codegraph: feature plan-service in calendar\n"
                         "// codegraph: uses services, members\n"
                         "// codegraph: schedule every day at 08:00\n"
                         "// codegraph: event stripe-paid as PaidEvent\n")
        self.assertEqual((t.kind, t.name, t.system), ("feature", "plan-service", "calendar"))
        self.assertEqual(t.uses, ["services", "members"])
        self.assertEqual(t.schedules, ["every day at 08:00"])
        self.assertEqual(t.events, [("stripe-paid", "PaidEvent")])

    def test_pages_components_and_the_rest(self):
        t = cg.read_tags("// codegraph: start page home at /\n")
        self.assertEqual((t.kind, t.name, t.route, t.start), ("page", "home", "/", True))
        self.assertEqual(cg.read_tags("/* codegraph: component people-picker */").unit,
                         "component:people-picker")
        self.assertEqual(cg.read_tags("// codegraph: design system").unit, "design")
        self.assertEqual(cg.read_tags("# codegraph: tooling").unit, "tooling")

    def test_tests_say_what_they_test(self):
        t = cg.read_tags("# codegraph: test module engine")
        self.assertEqual((t.kind, t.of, t.name), ("test", "module", "engine"))
        t = cg.read_tags("// codegraph: test ui home, members")
        self.assertEqual((t.of, t.walks), ("ui", ["home", "members"]))

    def test_a_store_and_what_a_module_reads(self):
        t = cg.read_tags("# codegraph: module m\n# codegraph: store members as Member\n"
                         "# codegraph: reads services\n")
        self.assertEqual((t.stores, t.reads), ([("members", "Member", 2)], ["services"]))

    def test_no_tags_is_none(self):
        self.assertIsNone(cg.read_tags("import os\n# a codegraph comment, not a tag\n"))

    def test_a_tag_must_sit_near_the_top(self):
        self.assertIsNone(cg.read_tags("\n" * 40 + "# codegraph: module late\n"))

    def test_a_tag_that_cannot_be_read(self):
        t = cg.read_tags("# codegraph: modul engine\n")
        self.assertTrue(any("cannot read" in e for _, e in t.errors))

    def test_two_kinds_in_one_file(self):
        t = cg.read_tags("# codegraph: module a\n# codegraph: tooling\n")
        self.assertTrue(any("two tags" in e for _, e in t.errors))

    def test_a_statement_the_kind_cannot_make(self):
        t = cg.read_tags("// codegraph: page home\n// codegraph: front door X\n")
        self.assertTrue(any("only a module" in e for _, e in t.errors))


class FrontDoors(Project):
    """The check: a module's front door says which names may cross into it."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "engine/__init__.py": mod("engine", "Book"),
            "engine/book.py": mod("engine") + "class Book: pass\ndef _fill(): pass\n",
            "app/__init__.py": mod("app", ""),
        })

    def app(self, source: str):
        return self.check({"app/main.py": mod("app") + source})

    def test_a_front_door_name_passes(self):
        self.assertEqual(self.app("from engine.book import Book\n").mismatches, [])

    def test_a_name_behind_the_door_is_a_mismatch(self):
        r = self.app("from engine.book import _fill\n")
        self.assertEqual(len(r.mismatches), 1)
        m = r.mismatches[0]
        self.assertEqual((m.rel, m.line), ("app/main.py", 2))
        self.assertIn("_fill", m.text)
        self.assertIn("engine", m.text)

    def test_the_path_an_import_takes_does_not_matter(self):
        r = self.check({
            "engine/__init__.py": mod("engine", "Book") + "from .book import Book\n",
            "app/main.py": mod("app") + "from engine import Book\n",
        })
        self.assertEqual(r.mismatches, [])

    def test_a_name_reached_through_an_alias(self):
        r = self.app("import engine.book as b\nb._fill()\n")
        self.assertEqual([(m.line, "_fill" in m.text) for m in r.mismatches], [(3, True)])

    def test_a_name_reached_through_the_full_dotted_path(self):
        self.assertEqual(len(self.app("import engine.book\nengine.book._fill()\n").mismatches), 1)

    def test_a_file_imported_by_name_then_used(self):
        r = self.app("from engine import book\nbook._fill()\nbook.Book()\n")
        self.assertEqual([m.line for m in r.mismatches], [3])

    def test_inside_a_module_anything_goes(self):
        r = self.check({"engine/other.py": mod("engine") + "from engine.book import _fill\n"})
        self.assertEqual(r.mismatches, [])

    def test_import_star_is_unknown_not_guessed(self):
        r = self.app("from engine.book import *\n")
        self.assertEqual((r.mismatches, len(r.unknown)), ([], 1))

    def test_a_module_passed_around_whole_is_unknown(self):
        r = self.app("import engine.book as b\nrun(b)\n")
        self.assertEqual((r.mismatches, [u.line for u in r.unknown]), ([], [3]))

    def test_third_party_and_stdlib_are_not_checked(self):
        r = self.app("import os\nfrom httpx import Client\n")
        self.assertEqual((r.mismatches, r.unknown), ([], []))

    def test_a_file_with_no_tag(self):
        r = self.check({"loose.py": ""})
        self.assertEqual([m.rel for m in r.mismatches], ["loose.py"])
        self.assertIn("no codegraph tag", r.mismatches[0].text)

    def test_a_module_with_no_front_door(self):
        r = self.check({"util/a.py": mod("util")})
        self.assertTrue(self.has(r.mismatches, "module util", "no front door"))

    def test_a_front_door_written_twice(self):
        r = self.check({"util/a.py": mod("util", "x"), "util/b.py": mod("util", "y")})
        self.assertTrue(self.has(r.mismatches, "more than one file"))

    def test_a_star_stays_in_its_folder(self):
        self.assertTrue(cg.path_match("atp/book.py", "atp/*"))
        self.assertFalse(cg.path_match("atp/engine/book.py", "atp/*"))
        self.assertTrue(cg.path_match("atp/engine/book.py", "atp/**"))

    def test_a_module_test_goes_through_the_front_door_too(self):
        r = self.check({"tests/test_book.py": "# codegraph: test module engine\n"
                                              "from engine.book import _fill\n"})
        self.assertEqual([m.rel for m in r.mismatches], ["tests/test_book.py"])

    def test_a_test_through_the_front_door_passes(self):
        r = self.check({"tests/test_book.py": "# codegraph: test module engine\n"
                                              "from engine.book import Book\n"})
        self.assertEqual(r.mismatches, [])

    def test_a_test_of_something_that_is_not_there(self):
        r = self.check({"tests/test_x.py": "# codegraph: test module ghost\n"})
        self.assertTrue(self.has(r.mismatches, "ghost", "not a module"))

    def test_the_program_never_imports_a_test(self):
        r = self.check({
            "tests/helpers.py": "# codegraph: test module engine\ndef make(): pass\n",
            "app/main.py": mod("app") + "from tests.helpers import make\n",
        })
        self.assertTrue(any(m.rel == "app/main.py" and "never imports a test" in m.text
                            for m in r.mismatches))


class Layers(Project):
    """Modules, features and the UI, and which way each may reach."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "members/__init__.py": mod("members", "find, add"),
            "members/store.py": mod("members") + "def find(): pass\ndef add(): pass\n",
            "features/join.py": ("# codegraph: feature join in people\n"
                                 "# codegraph: uses members\n"
                                 "# codegraph: event signed-up\n"
                                 "from members.store import add\n"),
        })

    def test_a_feature_through_a_declared_module_passes(self):
        r = self.check({})
        self.assertEqual(r.mismatches, [])

    def test_a_module_never_calls_a_feature(self):
        r = self.check({"members/hook.py": mod("members") + "from features.join import x\n"})
        self.assertTrue(self.has(r.mismatches, "never calls a feature"))

    def test_a_feature_must_say_which_modules_it_uses(self):
        r = self.check({
            "billing/__init__.py": mod("billing", "charge") + "def charge(): pass\n",
            "features/pay.py": ("# codegraph: feature pay in money\n# codegraph: event paid\n"
                                "from billing import charge\n"),
        })
        self.assertTrue(self.has(r.mismatches, "feature pay", "without saying so"))

    def test_a_feature_that_says_it_uses_a_module_it_does_not(self):
        r = self.check({"features/idle.py": ("# codegraph: feature idle in people\n"
                                             "# codegraph: uses members\n"
                                             "# codegraph: event x\n")})
        self.assertTrue(self.has(r.mismatches, "feature idle", "never does"))

    def test_a_feature_never_calls_another(self):
        r = self.check({"features/leave.py": ("# codegraph: feature leave in people\n"
                                              "# codegraph: event left\n"
                                              "from features.join import x\n")})
        self.assertTrue(self.has(r.mismatches, "never calls another feature"))

    def test_a_feature_names_its_system(self):
        r = self.check({"features/x.py": "# codegraph: feature x\n# codegraph: event e\n"})
        self.assertTrue(self.has(r.mismatches, "feature x", "names no system"))

    def test_a_feature_with_no_trigger(self):
        r = self.check({"features/x.py": "# codegraph: feature x in people\n"})
        self.assertTrue(self.has(r.mismatches, "feature x", "no trigger"))

    def test_a_page_that_acts_on_a_feature_is_its_trigger(self):
        r = self.check({
            "features/x.py": "# codegraph: feature x in people\n",
            "ui/home.py": "# codegraph: start page home\nfrom features.x import go\n",
            "tests/test_ui.py": "# codegraph: test ui home\n",
        })
        self.assertEqual(r.mismatches, [])

    def test_a_page_may_show_a_module_through_its_door(self):
        r = self.check({"ui/home.py": "# codegraph: start page home\nfrom members.store import find\n",
                        "tests/test_ui.py": "# codegraph: test ui home\n"})
        self.assertEqual(r.mismatches, [])

    def test_a_page_reaching_past_a_door(self):
        tree(self.root, {"members/store.py": mod("members") + "def find(): pass\ndef _raw(): pass\n"})
        r = self.check({"ui/home.py": "# codegraph: start page home\nfrom members.store import _raw\n",
                        "tests/test_ui.py": "# codegraph: test ui home\n"})
        self.assertTrue(self.has(r.mismatches, "_raw", "front door"))

    def test_a_page_never_imports_a_page(self):
        r = self.check({"ui/a.py": "# codegraph: start page a\nfrom ui.b import x\n",
                        "ui/b.py": "# codegraph: page b\n"})
        self.assertTrue(self.has(r.mismatches, "never imports another page"))

    def test_a_component_never_contains_a_page(self):
        r = self.check({"ui/c.py": "# codegraph: component c\nfrom ui.b import x\n",
                        "ui/b.py": "# codegraph: start page b\n"})
        self.assertTrue(self.has(r.mismatches, "never contains a page"))

    def test_the_design_system_has_no_wires(self):
        r = self.check({"ui/button.py": "# codegraph: design system\nfrom members.store import find\n"})
        self.assertTrue(self.has(r.mismatches, "design system has no wires"))

    def test_the_program_never_imports_tooling(self):
        r = self.check({"build.py": "# codegraph: tooling\n",
                        "members/x.py": mod("members") + "import build\n"})
        self.assertTrue(self.has(r.mismatches, "never imports tooling"))

    def test_only_a_module_reaches_outside(self):
        r = self.check({"features/join.py": ("# codegraph: feature join in people\n"
                                             "# codegraph: uses members\n# codegraph: event e\n"
                                             "import httpx\nfrom members.store import add\n"
                                             "httpx.get('https://api.example.com/x')\n")})
        self.assertTrue(self.has(r.mismatches, "api.example.com", "only a module"))

    def test_tooling_and_a_server_may_reach_outside(self):
        r = self.check({"deploy.py": "# codegraph: tooling\nimport httpx\nhttpx.get('https://x.io')\n",
                        "features/api.py": ("# codegraph: feature api in people\n"
                                            "# codegraph: event request\n"
                                            "from fastapi import FastAPI\napp = FastAPI()\n")})
        self.assertEqual(r.mismatches, [])


class Stores(Project):
    """A store has one owning module, its shape read from a schema."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "members/__init__.py": mod("members", "add"),
            "members/model.py": (mod("members") + "# codegraph: store members\n"
                                 "from pydantic import BaseModel\n"
                                 "class Member(BaseModel):\n    name: str\n    age: int\n"),
            "members/db.py": mod("members") + "def add(c): c.execute('INSERT INTO members VALUES (?)')\n",
        })

    def test_the_owner_writes_its_store(self):
        r = cg.read_map(self.root)
        self.assertEqual(r.mismatches, [])
        self.assertEqual(r.stores["members"]["schema"].lines(), ["name: str", "age: int"])
        self.assertIn(("module:members", "store:members", "writes"), r.wires)

    def test_a_store_with_no_schema(self):
        r = self.check({"jobs/__init__.py": mod("jobs", "") + "# codegraph: store jobs\n"})
        self.assertTrue(self.has(r.mismatches, "store jobs", "no schema"))

    def test_a_store_named_after_a_schema_it_cannot_find(self):
        r = self.check({"jobs/__init__.py": mod("jobs", "") + "# codegraph: store jobs as Job\n"})
        self.assertTrue(self.has(r.mismatches, "store jobs", "Job"))

    def test_a_store_owned_twice(self):
        r = self.check({"other/__init__.py": mod("other", "") + "# codegraph: store members\n"})
        self.assertTrue(self.has(r.mismatches, "store members", "one owning module"))

    def test_another_module_never_writes_it(self):
        r = self.check({"other/__init__.py": mod("other", "") +
                        "def x(c): c.execute('UPDATE members SET name = 1')\n"})
        self.assertTrue(self.has(r.mismatches, "writes store members", "only its owner"))

    def test_a_declared_reader_may_read_it(self):
        r = self.check({"report/__init__.py": mod("report", "") + "# codegraph: reads members\n"
                        "def x(c): c.execute('SELECT name FROM members')\n"})
        self.assertEqual(r.mismatches, [])

    def test_an_undeclared_reader(self):
        r = self.check({"report/__init__.py": mod("report", "") +
                        "def x(c): c.execute('SELECT name FROM members')\n"})
        self.assertTrue(self.has(r.mismatches, "reads store members", "without saying so"))

    def test_a_feature_never_reaches_a_store(self):
        r = self.check({"features/x.py": ("# codegraph: feature x in people\n# codegraph: event e\n"
                                          "def go(db): db.collection('members').add({})\n")})
        self.assertTrue(self.has(r.mismatches, "store members directly"))

    def test_a_collection_that_is_no_store(self):
        r = self.check({"other/__init__.py": mod("other", "") +
                        "def x(db): db.collection('ghosts').get()\n"})
        self.assertTrue(self.has(r.mismatches, "ghosts", "not a declared store"))


class Shapes(unittest.TestCase):
    """Reading a schema's fields, whatever wrote it."""

    def fields(self, rel: str, text: str, name: str | None = None) -> list:
        found = shapes.schemas_in(rel, text)
        return next(s for s in found if name is None or s.name == name).fields

    def test_a_dataclass_and_a_typed_dict(self):
        self.assertEqual(self.fields("a.py", "@dataclass\nclass A:\n    x: int\n    y: str = ''\n"),
                         [("x", "int"), ("y", "str")])
        self.assertEqual(self.fields("a.py", "class A(TypedDict):\n    x: list[int]\n"),
                         [("x", "list[int]")])

    def test_sqlalchemy_columns_and_the_table_they_map(self):
        found = shapes.schemas_in("m.py", (
            "class Member(Base):\n    __tablename__ = 'members'\n"
            "    id = Column(Integer, primary_key=True)\n    name: Mapped[str] = mapped_column()\n"))
        self.assertEqual((found[0].table, found[0].fields),
                         ("members", [("id", "Integer"), ("name", "str")]))

    def test_sql_create_table(self):
        self.assertEqual(self.fields("s.sql", "CREATE TABLE IF NOT EXISTS members (\n"
                                     "  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n"
                                     "  PRIMARY KEY (id)\n);"),
                         [("id", "INTEGER"), ("name", "TEXT")])

    def test_typescript_interfaces_types_and_zod(self):
        src = ("export interface Member { id: number; name?: string; onJoin: () => void }\n"
               "type Service = {\n  date: Date,\n  hymns: string[]\n}\n"
               "const Paid = z.object({ amount: z.number(), note: z.string().optional() })\n")
        self.assertEqual(self.fields("t.ts", src, "Member"),
                         [("id", "number"), ("name", "string"), ("onJoin", "() => void")])
        self.assertEqual(self.fields("t.ts", src, "Service"), [("date", "Date"), ("hymns", "string[]")])
        self.assertEqual(self.fields("t.ts", src, "Paid"), [("amount", "number"), ("note", "string")])

    def test_prisma(self):
        found = shapes.schemas_in("schema.prisma", 'model Member {\n  id Int @id\n  name String\n'
                                  '  @@map("members")\n}\n')
        self.assertEqual((found[0].table, found[0].fields),
                         ("members", [("id", "Int"), ("name", "String")]))

    def test_a_store_finds_its_schema_singular_or_plural(self):
        found = shapes.schemas_in("a.py", "class Member(BaseModel):\n    x: int\n")
        self.assertEqual(shapes.find(found, "members").name, "Member")
        self.assertIsNone(shapes.find(found, "services"))
        self.assertIsNone(shapes.find(found, "member", exact=True))


class PageMap(Project):
    """Where a person can go: pages, their links, and the start page."""

    def pages(self, files: dict):
        tree(self.root, dict({"tests/walk.py": "# codegraph: test ui home, members, member\n"}, **files))
        return cg.read_map(self.root)

    def test_a_link_leads_to_the_page_at_its_route(self):
        r = self.pages({"web/app/page.tsx": "// codegraph: start page home\n<a href=\"/members\">",
                        "web/app/members/page.tsx": "// codegraph: page members\n"})
        self.assertIn(("page:home", "page:members", "leads"), r.wires)
        self.assertEqual(r.units["page:members"].route, "/members")
        self.assertFalse(self.has(r.mismatches, "cannot be reached"))

    def test_a_link_with_a_value_filled_in_matches_a_route_with_a_slot(self):
        r = self.pages({"web/app/page.tsx": "// codegraph: start page home\n"
                                            "router.push(`/members/${id}`)\n",
                        "web/app/members/[id]/page.tsx": "// codegraph: page member\n"})
        self.assertIn(("page:home", "page:member", "leads"), r.wires)

    def test_a_link_built_while_running_cannot_be_told(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n<Link href={url}>"})
        self.assertTrue(self.has(r.unknown, "builds a link"))

    def test_a_page_nothing_leads_to(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n",
                        "web/members.tsx": "// codegraph: page members at /members\n"})
        self.assertTrue(self.has(r.mismatches, "page members", "cannot be reached"))

    def test_no_start_page(self):
        r = self.pages({"web/home.tsx": "// codegraph: page home at /\n"})
        self.assertTrue(self.has(r.mismatches, "no page is a start page"))

    def test_a_components_links_belong_to_its_pages(self):
        if not HAS_SCRIPT:
            self.skipTest("tree-sitter is not installed")
        r = self.pages({"web/home.tsx": ("// codegraph: start page home at /\n"
                                         "import { Nav } from './nav';\n"),
                        "web/nav.tsx": "// codegraph: component nav\n<a href='/members'>",
                        "web/members.tsx": "// codegraph: page members at /members\n"})
        self.assertIn(("page:home", "page:members", "leads"), r.wires)

    def test_a_page_no_ui_test_walks(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n",
                        "web/about.tsx": "// codegraph: page about at /about\n"})
        self.assertTrue(self.has(r.mismatches, "no UI test walks page about"))

    def test_routes_from_the_framework(self):
        self.assertEqual(cg.route_of("app/(shop)/cart/page.tsx"), "/cart")
        self.assertEqual(cg.route_of("src/pages/index.tsx"), "/")
        self.assertEqual(cg.route_of("src/pages/api/x.ts"), "")
        self.assertTrue(cg.route_matches("/docs/a/b", "/docs/[...slug]"))
        self.assertFalse(cg.route_matches("/members", "/members/[id]"))


class Fakes(Project):
    """A test fakes only what is outside the program, never its own code."""

    def setUp(self):
        super().setUp()
        tree(self.root, {"bars/__init__.py": mod("bars", "fetch"),
                         "bars/feed.py": mod("bars") + "import httpx\ndef fetch(): pass\n"})

    def test_faking_the_repos_own_function(self):
        r = self.check({"tests/test_feed.py": "# codegraph: test module bars\n"
                                              "patch('bars.feed.fetch')\n"})
        self.assertTrue(self.has(r.mismatches, "fakes bars.feed.fetch"))

    def test_faking_what_a_file_takes_from_outside_is_fine(self):
        r = self.check({"tests/test_feed.py": "# codegraph: test module bars\n"
                                              "patch('bars.feed.httpx')\n"})
        self.assertEqual(r.mismatches, [])


class MapViews(Project):
    """The page's map, its page map and the view inside each card, built
    from the same reading the check makes."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "members/__init__.py": mod("members", "find") + "# codegraph: store members\n"
                                   "import sqlite3\nclass Member(TypedDict):\n    name: str\n"
                                   "def find(): sqlite3.connect('x.db').execute('INSERT INTO members')\n",
            "features/join.py": ("# codegraph: feature join in people\n# codegraph: uses members\n"
                                 "# codegraph: schedule every day\nfrom members import find\n"),
            "ui/home.py": "# codegraph: start page home at /\nfrom features.join import go\n"
                          "redirect('/about')\n",
            "ui/about.py": "# codegraph: page about at /about\nfrom ui.button import b\n",
            "ui/button.py": "# codegraph: design system\n",
            "tests/test_walk.py": "# codegraph: test ui home, about\n",
        })
        self.g = cg.build(self.root, reading=cg.read_map(self.root))
        self.views = self.g["map"]["views"]

    def edge(self, view, src, dst):
        return next((e for e in self.views[view]["edges"]
                     if e["from"] == src and e["to"] == dst), None)

    def ids(self, view):
        return {n["id"] for n in self.views[view]["nodes"]}

    def test_one_card_per_unit_store_trigger_and_outside(self):
        self.assertEqual(self.ids("map"), {
            "module:members", "feature:join", "page:home", "page:about", "design",
            "store:members", "trigger:feature:join:0", "svc:sqlite"})

    def test_the_wires_say_what_kind_they_are(self):
        self.assertEqual(self.edge("map", "feature:join", "module:members")["kind"], "uses")
        self.assertEqual(self.edge("map", "page:home", "feature:join")["kind"], "acts")
        self.assertEqual(self.edge("map", "module:members", "store:members")["kind"], "writes")
        self.assertEqual(self.edge("map", "trigger:feature:join:0", "feature:join")["kind"], "starts")
        self.assertEqual(self.edge("map", "module:members", "svc:sqlite")["kind"], "database")
        self.assertEqual(self.edge("map", "page:home", "page:about")["kind"], "leads")

    def test_styling_is_no_wire(self):
        self.assertIsNone(self.edge("map", "page:about", "design"))

    def test_the_names_that_cross_ride_on_the_wire(self):
        e = self.edge("map", "feature:join", "module:members")
        self.assertEqual((e["names"], e["bad"], e["why"]), (["find"], [], []))

    def test_a_store_card_shows_its_shape(self):
        card = next(n for n in self.views["map"]["nodes"] if n["id"] == "store:members")
        self.assertEqual(card["fields"], ["name: str"])

    def test_the_page_map_starts_on_the_left(self):
        col = {n["id"]: n["col"] for n in self.views["pages"]["nodes"]}
        self.assertLess(col["page:home"], col["page:about"])
        self.assertEqual(self.g["map"]["top"], ["map", "pages"])

    def test_inside_a_feature_its_files_and_its_neighbours(self):
        self.assertEqual(self.ids("feature:join"), {"features.join", "module:members",
                                                    "page:home", "trigger:feature:join:0"})

    def test_a_broken_rule_turns_the_wire_red(self):
        tree(self.root, {"members/hook.py": mod("members") + "from features.join import go\n"})
        g = cg.build(self.root, reading=cg.read_map(self.root))
        e = next(e for e in g["map"]["views"]["map"]["edges"]
                 if (e["from"], e["to"]) == ("module:members", "feature:join"))
        self.assertTrue(e["why"])

    def test_every_view_is_placed_and_closed(self):
        for name, view in self.views.items():
            ids = self.ids(name)
            for n in view["nodes"]:
                self.assertIn("col", n, name)
            for e in view["edges"]:
                self.assertIn(e["from"], ids, name)
                self.assertIn(e["to"], ids, name)

    def test_the_findings_travel_with_the_page(self):
        self.assertEqual((self.g["map"]["source"], self.g["map"]["mismatches"]), ("tags", []))

    def test_the_summary_for_the_mod(self):
        s = cg.summary(self.g)
        self.assertEqual(s["systems"][0]["name"], "people")
        self.assertEqual(s["systems"][0]["features"][0]["triggers"], ["schedule every day"])
        self.assertEqual(s["stores"][0]["fields"], ["name: str"])
        self.assertTrue(s["svg"].startswith("<svg"))

    def test_no_reading_no_map(self):
        self.assertNotIn("map", cg.build(self.root))


class Drafting(Project):
    """A first set of tags, made from what the code does today."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "engine/__init__.py": "",
            "engine/book.py": "class Book: pass\ndef _fill(): pass\n",
            "engine/gate.py": "from engine.book import _fill\n",
            "app/__init__.py": "",
            "app/main.py": "#!/usr/bin/env python\nfrom engine.book import Book\n",
            "tests/test_book.py": "from engine.book import _fill\n",
            "setup.py": "",
        })
        self.drafts = cg.draft_tags(self.root)

    def test_one_module_per_folder_with_its_door_on_the_folders_own_file(self):
        self.assertEqual(self.drafts["engine/book.py"], ["module engine"])
        self.assertEqual(self.drafts["engine/__init__.py"], ["module engine", "front door Book"])

    def test_tests_and_tooling_are_found_by_their_names(self):
        self.assertEqual(self.drafts["tests/test_book.py"], ["test module engine"])
        self.assertEqual(self.drafts["setup.py"], ["tooling"])

    def test_a_generic_folder_name_gives_way_to_its_parent(self):
        tree(self.root, {"packages/core/src/index.py": "", "packages/web/src/main.py": "",
                         "packages/web/build.py": ""})
        d = cg.draft_tags(self.root)
        self.assertEqual(d["packages/core/src/index.py"][0], "module core")
        # two folders that would both be "web" keep their paths apart
        self.assertEqual(d["packages/web/src/main.py"][0], "module packages/web/src")

    def test_written_into_the_files_the_draft_passes_except_where_tests_reach_in(self):
        cg.write_drafts(self.root, self.drafts)
        self.assertTrue((self.root / "app/main.py").read_text().startswith(
            "#!/usr/bin/env python\n# codegraph: module app\n"))
        r = cg.check(self.root)
        self.assertEqual(sorted({m.rel for m in r.mismatches}), ["tests/test_book.py"])
        self.assertEqual(cg.draft_tags(self.root), {})          # nothing left to tag

    def test_a_feature_folder_and_the_ui(self):
        if not HAS_SCRIPT:
            self.skipTest("tree-sitter is not installed")
        tree(self.root, {
            "src/features/calendar/plan.ts": 'import { Book } from "../../../engine/book";\n',
            "src/app/page.tsx": 'import { plan } from "../features/calendar/plan";\n',
            "src/app/members/page.tsx": "",
            "src/components/PeoplePicker.tsx": "",
            "src/components/ui/button.tsx": "",
            "e2e/walk.spec.ts": 'import { test } from "@playwright/test";\n',
        })
        d = cg.draft_tags(self.root)
        self.assertEqual(d["src/features/calendar/plan.ts"][0], "feature plan in calendar")
        self.assertEqual(d["src/app/page.tsx"], ["start page home"])
        self.assertEqual(d["src/app/members/page.tsx"], ["page members"])
        self.assertEqual(d["src/components/PeoplePicker.tsx"], ["component people-picker"])
        self.assertEqual(d["src/components/ui/button.tsx"], ["design system"])
        self.assertEqual(d["e2e/walk.spec.ts"], ["test ui"])

    def test_an_old_declaration_seeds_the_modules(self):
        (self.root / "codegraph.json").write_text(json.dumps({"modules": {
            "core": {"files": ["engine/*", "app/*"], "front_door": ["Book", "_fill"]}}}))
        d = cg.draft_tags(self.root)
        self.assertEqual(d["app/main.py"], ["module core"])
        self.assertIn("front door Book, _fill", sum(d.values(), []))

    def test_stores_the_modules_reach(self):
        tree(self.root, {"engine/db.py": "def save(c): c.execute('INSERT INTO books VALUES (1)')\n",
                         "app/report.py": "def r(c): c.execute('SELECT * FROM books')\n"})
        d = cg.draft_tags(self.root)
        self.assertIn("store books", d["engine/db.py"])
        self.assertIn("reads books", d["app/report.py"])

    def test_tags_go_after_use_client(self):
        self.assertEqual(cg.insert_tags('"use client";\nexport {}\n', ["component x"], "//"),
                         '"use client";\n// codegraph: component x\nexport {}\n')




@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptImports(unittest.TestCase):
    """TypeScript and JavaScript: which file an import lands on. Parsing is
    tree-sitter's job; resolving is ours, and it is where the bugs live."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def graph(self, files: dict, **kw):
        tree(self.root, files)
        return cg.build(self.root, **kw)

    def edges(self, g) -> set:
        return {(e["from"], e["to"]) for e in g["edges"] if e["kind"] in ("import", "lazy")}

    def test_a_relative_import_finds_the_ts_file(self):
        g = self.graph({"src/a.ts": 'import { b } from "./b";\n',
                        "src/b.ts": "export const b = 1;\n"})
        self.assertIn(("src/a.ts", "src/b.ts"), self.edges(g))

    def test_a_folder_import_finds_its_index(self):
        g = self.graph({"src/a.ts": 'import { x } from "./lib";\n',
                        "src/lib/index.ts": "export const x = 1;\n"})
        self.assertIn(("src/a.ts", "src/lib/index.ts"), self.edges(g))

    def test_a_js_ending_finds_the_ts_file(self):
        # ES modules write the .js the compiler will emit, not the .ts on disk
        g = self.graph({"src/a.ts": 'import { b } from "./b.js";\n',
                        "src/b.ts": "export const b = 1;\n"})
        self.assertIn(("src/a.ts", "src/b.ts"), self.edges(g))

    def test_a_tsconfig_shortcut(self):
        g = self.graph({
            "tsconfig.json": (
                '{\n  // comments and a trailing comma, as tsconfig allows\n'
                '  "compilerOptions": {\n    "baseUrl": ".",\n'
                '    "paths": {\n      "@app/core": ["packages/core/src/index.ts"],\n'
                '      "@/*": ["src/*"],\n    },\n  },\n}\n'),
            "packages/core/src/index.ts": "export const core = 1;\n",
            "src/util/time.ts": "export const now = 1;\n",
            "src/main.ts": 'import { core } from "@app/core";\nimport { now } from "@/util/time";\n',
        })
        self.assertIn(("src/main.ts", "packages/core/src/index.ts"), self.edges(g))
        self.assertIn(("src/main.ts", "src/util/time.ts"), self.edges(g))

    def test_a_workspace_package_by_its_name(self):
        g = self.graph({
            "packages/core/package.json": '{"name": "@acme/core", "main": "src/index.ts"}',
            "packages/core/src/index.ts": "export const core = 1;\n",
            "packages/app/src/main.ts": 'import { core } from "@acme/core";\n',
        })
        self.assertIn(("packages/app/src/main.ts", "packages/core/src/index.ts"), self.edges(g))

    def test_node_built_ins_are_ignored(self):
        g = self.graph({"a.ts": 'import * as os from "node:os";\nimport fs from "fs";\n'})
        self.assertEqual((self.edges(g), g["externals_seen"]), (set(), {}))

    def test_a_package_is_counted_by_its_whole_name(self):
        g = self.graph({"a.ts": 'import { X } from "@scope/pkg/sub/types.js";\nimport lodash from "lodash";\n'})
        self.assertEqual(sorted(g["externals_seen"]), ["@scope/pkg", "lodash"])

    def test_require_export_from_and_dynamic_import(self):
        g = self.graph({
            "a.js": 'const b = require("./b");\nexport * from "./c";\n'
                    'async function later() { return import("./d"); }\n',
            "b.js": "", "c.js": "", "d.js": "",
        })
        kinds = {e["to"]: e["kind"] for e in g["edges"] if e["from"] == "a.js"}
        self.assertEqual(kinds, {"b.js": "import", "c.js": "import", "d.js": "lazy"})

    def test_declaration_files_are_left_out(self):
        g = self.graph({"a.ts": "export const a = 1;\n", "types.d.ts": "declare const x: number;\n"})
        self.assertEqual([n["id"] for n in g["nodes"]], ["a.ts"])

    def test_python_and_typescript_in_one_codebase(self):
        g = self.graph({"api/app.py": "", "web/main.ts": 'import { a } from "./a";\n',
                        "web/a.ts": "export const a = 1;\n"})
        self.assertEqual({n["id"] for n in g["nodes"]}, {"api.app", "web/main.ts", "web/a.ts"})


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptUses(unittest.TestCase):
    """Which names a TypeScript file takes from another, for front doors."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {"core/book.ts": ("// codegraph: module core\n// codegraph: front door Book\n"
                                          "export class Book {}\nexport function fill() {}\n")})

    def check(self, source: str):
        tree(self.root, {"app/main.ts": "// codegraph: module app\n// codegraph: front door\n" + source})
        return cg.check(self.root)

    def test_a_named_import_on_the_door_passes(self):
        self.assertEqual(self.check('import { Book } from "../core/book";\n').mismatches, [])

    def test_a_named_import_off_the_door_is_a_mismatch(self):
        r = self.check('import { Book, fill as f } from "../core/book";\n')
        self.assertEqual([("fill" in m.text, m.line) for m in r.mismatches], [(True, 3)])

    def test_a_namespace_import_is_read_by_what_it_touches(self):
        r = self.check('import * as book from "../core/book";\nnew book.Book();\nbook.fill();\n')
        self.assertEqual([m.line for m in r.mismatches], [5])

    def test_a_namespace_handed_around_whole_cannot_be_told(self):
        r = self.check('import * as book from "../core/book";\nkeep(book);\n')
        self.assertEqual((r.mismatches, [u.line for u in r.unknown]), ([], [4]))

    def test_a_default_import_uses_default(self):
        r = self.check('import Book from "../core/book";\n')
        self.assertTrue(any("default" in m.text for m in r.mismatches))

    def test_test_files_are_found_by_their_names(self):
        self.assertTrue(cg.looks_like_test("src/book.test.ts"))
        self.assertTrue(cg.looks_like_test("src/book.spec.tsx"))
        self.assertFalse(cg.looks_like_test("src/book.ts"))

    def test_faking_the_repos_own_file(self):
        tree(self.root, {"core/book.test.ts": "// codegraph: test module core\nvi.mock('./book');\n"})
        self.assertTrue(any("fakes ./book" in m.text for m in cg.check(self.root).mismatches))


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptOutside(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def conns(self, source: str) -> dict:
        tree(self.root, {"a.ts": source})
        f = cg.files_in(self.root)[0]
        return {c.target: c.kind for c in cg.reader_of(f).outside(f)}

    def test_a_fetched_url_becomes_its_host(self):
        self.assertEqual(self.conns('await fetch("https://api.example.com/v1/x");\n'),
                         {"net:api.example.com": "http"})

    def test_the_environment(self):
        self.assertEqual(self.conns("const key = process.env.API_KEY;\n"),
                         {"env:environment": "env"})

    def test_a_library_found_through_its_import(self):
        found = self.conns('import { spawn } from "node:child_process";\nspawn("git");\n'
                           'import Anthropic from "@anthropic-ai/sdk";\nnew Anthropic();\n')
        self.assertEqual(found, {"svc:child_process": "process", "svc:anthropic": "http"})

    def test_a_plain_file_reaches_nothing(self):
        self.assertEqual(self.conns("export const add = (a: number, b: number) => a + b;\n"), {})

    def test_a_port_filled_in_later_leaves_the_host(self):
        self.assertEqual(self.conns("const u = `http://127.0.0.1:${port}/x`;\n"),
                         {"net:127.0.0.1": "http"})

    def test_an_app_link_is_not_a_web_call(self):
        self.assertEqual(self.conns('open("obsidian://open?vault=x");\n'), {})


if __name__ == "__main__":
    unittest.main()
