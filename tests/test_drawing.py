# codegraph: test module drawing
"""The file graph, the map views and the pane's summary."""
from __future__ import annotations

import json
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

from modules.drawing import build, summary
from modules.rules import read_map
from modules.source import OUTSIDE
from tests.helpers import Folder, mod, tree


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
        self.g = build(self.root)

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
                      [n["id"] for n in build(self.root, hidden=True)["nodes"]])

    def test_externals_become_cards_when_asked(self):
        g = build(self.root, externals=True)
        self.assertIn("ext:httpx", [n["id"] for n in g["nodes"]])
        self.assertEqual(g["groups"][-1], "(external)")

    def test_every_edge_points_at_a_real_node(self):
        ids = {n["id"] for n in self.g["nodes"]}
        for e in self.g["edges"]:
            self.assertIn(e["from"], ids)
            self.assertIn(e["to"], ids)


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
        g = build(self.root)
        outs = [n for n in g["nodes"] if n["kind"] == "outside"]
        self.assertEqual({n["id"] for n in outs},
                         {"net:api.example.com", "svc:sqlite"})
        self.assertEqual(g["groups"][-1], OUTSIDE)

    def test_the_wires_point_from_the_file_that_makes_them(self):
        g = build(self.root)
        pairs = {(e["from"], e["to"]): e["kind"] for e in g["edges"]}
        self.assertEqual(pairs[("app.client", "net:api.example.com")], "http")
        self.assertEqual(pairs[("app.store", "svc:sqlite")], "database")

    def test_only_the_kinds_in_use_are_published(self):
        self.assertEqual(set(build(self.root)["kinds"]), {"http", "database"})

    def test_no_outside_leaves_imports_alone(self):
        g = build(self.root, outside=False)
        self.assertEqual([n for n in g["nodes"] if n["kind"] == "outside"], [])
        self.assertNotIn(OUTSIDE, g["groups"])


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
        g = build(self.root)
        for n in g["nodes"]:
            self.assertIsInstance(n["col"], int)
            self.assertIsInstance(n["row"], int)

    def test_what_is_imported_sits_left_of_what_imports_it(self):
        # so every wire, drawn as flowing into the importer, runs rightward
        g = build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        for e in g["edges"]:
            if e["kind"] in ("import", "lazy"):
                self.assertLess(col[e["to"]], col[e["from"]],
                                "%s -> %s" % (e["from"], e["to"]))

    def test_the_entry_point_is_right_of_the_leaf(self):
        g = build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        self.assertGreater(col["app.cli"], col["app.work"])
        self.assertGreater(col["app.work"], col["core.models"])

    def test_outside_cards_get_the_first_column(self):
        g = build(self.root)
        col = {n["id"]: n["col"] for n in g["nodes"]}
        self.assertEqual(col["svc:sqlite"], 0)
        self.assertEqual(g["columns"][0]["label"], "outside")

    def test_no_column_claims_to_be_entry_points(self):
        # nothing importing a file can mean it is run, loaded by name or dead,
        # so the column does not pretend to know which
        labels = [c["label"] for c in build(self.root)["columns"]]
        self.assertNotIn("entry points", labels)

    def test_rows_within_a_column_are_distinct(self):
        g = build(self.root)
        per = defaultdict(list)
        for n in g["nodes"]:
            per[n["col"]].append(n["row"])
        for col, rows in per.items():
            self.assertEqual(sorted(rows), list(range(len(rows))))

    def test_empty_init_files_are_dropped(self):
        ids = {n["id"] for n in build(self.root)["nodes"]}
        self.assertNotIn("app", ids)
        self.assertIn("app", {n["id"] for n in
                              build(self.root, keep_empty=True)["nodes"]})

    def test_folder_layout_still_works(self):
        g = build(self.root, layout="folder")
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
        self.assertEqual(build(self.root)["groups"], ["app", "core"])

    def test_a_cycle_still_produces_an_order(self):
        tree(self.root, {
            "a/__init__.py": "", "a/x.py": "import b.y\n",
            "b/__init__.py": "", "b/y.py": "import a.x\n",
        })
        groups = build(self.root)["groups"]
        self.assertEqual(sorted(groups), ["a", "b"])


class MapViews(Folder):
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
        self.g = build(self.root, reading=read_map(self.root))
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
        g = build(self.root, reading=read_map(self.root))
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
        s = summary(self.g)
        self.assertEqual(s["systems"][0]["name"], "people")
        self.assertEqual(s["systems"][0]["features"][0]["triggers"], ["schedule every day"])
        self.assertEqual(s["stores"][0]["fields"], ["name: str"])
        self.assertTrue(s["svg"].startswith("<svg"))

    def test_no_reading_no_map(self):
        self.assertNotIn("map", build(self.root))
