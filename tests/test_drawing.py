# codegraph: test module drawing
"""The file graph, the map views and the pane's summary."""
from __future__ import annotations

import json
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

from modules.drawing import build, fresh_map_of, map_of, summary
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

    def test_the_map_is_drawn_in_blocks(self):
        at = {n["id"]: n for n in self.views["map"]["nodes"]}
        self.assertEqual((at["store:members"]["block"], at["store:members"]["tier"]), ("reach", 0))
        self.assertEqual((at["module:members"]["block"], at["module:members"]["tier"]), ("modules", 1))
        self.assertEqual((at["design"]["block"], at["design"]["tier"]), ("kit", 2))
        self.assertEqual([b["id"] for b in self.views["map"]["blocks"]],
                         ["reach", "modules", "starts", "features", "system:people", "pages", "kit"])
        self.assertEqual(self.views["map"]["blocks"][4]["within"], "features")

    def test_every_card_in_every_view_has_a_size(self):
        for name, view in self.views.items():
            self.assertTrue(all(0.9 <= n["size"] <= 2 for n in view["nodes"]), name)

    def test_the_pane_gets_the_blocks_too(self):
        m = summary(self.g)["views"]["map"]
        self.assertEqual(m["blocks"][0], {"id": "reach", "label": "outside + stores"})
        store = next(n for n in m["nodes"] if n["id"] == "store:members")
        self.assertEqual((store["block"], store["tier"]), ("reach", 0))

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
        self.assertEqual(set(s["views"]), set(self.views))
        home = next(n for n in s["views"]["map"]["nodes"] if n["id"] == "page:home")
        self.assertEqual((home["start"], home["route"]), (True, "/"))
        for name, view in s["views"].items():
            self.assertTrue(all("col" in n and "row" in n for n in view["nodes"]), name)
        self.assertEqual(s["issues"], [])

    def test_each_mismatch_in_the_summary_names_its_group_and_card(self):
        tree(self.root, {"features/join.py": ("# codegraph: feature join in people\n"
                                              "# codegraph: uses members\n"
                                              "from members import find, Member\n")})
        s = summary(build(self.root, reading=read_map(self.root)))
        door = next(i for i in s["issues"] if "front door" in i["text"])
        self.assertEqual((door["group"], door["card"], door["rel"]),
                         ("doors", "feature:join", "features/join.py"))
        self.assertEqual(door["line_text"], "{}:{}  {}".format(door["rel"], door["line"], door["text"]))
        self.assertEqual([g["id"] for g in s["groups"]][:2], ["layers", "doors"])

    def test_a_plan_draws_what_is_not_built_yet_as_ghosts(self):
        tree(self.root, {"plans/remind.json": json.dumps({
            "ask": "Remind people.",
            "cards": [{"kind": "feature", "name": "remind", "system": "people",
                       "about": "Sends the reminders.", "triggers": ["schedule every Monday"]},
                      {"kind": "module", "name": "members", "door": ["find", "email"]},
                      {"kind": "page", "name": "rota", "route": "/rota"}],
            "wires": [{"from": "feature:remind", "kind": "uses", "to": "module:members"},
                      {"from": "feature:join", "kind": "uses", "to": "module:members"},
                      {"from": "page:about", "kind": "leads to", "to": "page:rota"}]})})
        g = build(self.root, reading=read_map(self.root))
        plan = g["map"]["plans"][0]
        self.assertEqual((plan["name"], plan["built"]), ("remind", False))
        nodes = {n["id"]: n for n in g["map"]["views"]["map"]["nodes"]}
        ghost = nodes["feature:remind"]
        self.assertEqual((ghost["ghost"], ghost["plan"], ghost["about"]), (True, "remind", "Sends the reminders."))
        self.assertEqual(nodes["module:members"]["left"], ["front door lacks email"])
        self.assertNotIn("ghost", nodes["module:members"])
        planned = [(e["from"], e["to"]) for e in g["map"]["views"]["map"]["edges"] if e.get("plan")]
        self.assertIn(("feature:remind", "module:members"), planned)
        self.assertNotIn(("feature:join", "module:members"), planned)      # already built
        self.assertIn("page:rota", {n["id"] for n in g["map"]["views"]["pages"]["nodes"]})
        self.assertEqual([p["name"] for p in summary(g)["plans"]], ["remind"])

    def test_a_planned_system_is_a_box_among_the_features(self):
        tree(self.root, {"plans/billing.json": json.dumps({
            "cards": [{"kind": "system", "name": "billing", "about": "Invoices, and reminding people to pay."}]})})
        g = build(self.root, reading=read_map(self.root))
        view = g["map"]["views"]["map"]
        ghost = {n["id"]: n for n in view["nodes"]}["system:billing"]
        self.assertEqual((ghost["ghost"], ghost["block"], ghost["group"]), (True, "features", "system:billing"))
        self.assertIn({"id": "system:billing", "label": "billing", "within": "features"},
                      [{k: b[k] for k in ("id", "label", "within") if k in b} for b in view["blocks"]])

    def test_a_reviewed_drawing_shows_the_agents_changes_and_comments(self):
        tree(self.root, {"plans/billing.json": json.dumps({
            "drawn": True, "reviewed": True,
            "drawing": {"cards": [{"kind": "module", "name": "dunning", "about": "Sends chasers"},
                                  {"kind": "page", "name": "owed", "about": "Who owes"}],
                        "wires": [{"from": "page:owed", "kind": "informed by", "to": "module:dunning"}]},
            "cards": [{"kind": "page", "name": "owed", "about": "Who owes what, and since when"},
                      {"kind": "module", "name": "billing"}],
            "wires": [{"from": "page:owed", "kind": "informed by", "to": "module:billing"}],
            "comments": [{"on": "module:dunning", "by": "agent", "text": "Fold this into billing"},
                         {"on": "page:owed informed by module:billing", "by": "agent", "text": "Moved here"}]})})
        g = build(self.root, reading=read_map(self.root))
        view = g["map"]["views"]["map"]
        nodes = {n["id"]: n for n in view["nodes"]}
        self.assertEqual((nodes["module:billing"]["change"], nodes["page:owed"]["was"]),
                         ("added", {"about": "Who owes"}))
        self.assertTrue(nodes["module:dunning"]["struck"])
        self.assertEqual(nodes["module:dunning"]["comments"],
                         [{"by": "agent", "text": "Fold this into billing", "plan": "billing"}])
        wires = {(e["from"], e["to"]): e for e in view["edges"] if e.get("plan")}
        self.assertTrue(wires[("page:owed", "module:dunning")]["struck"])
        self.assertEqual(wires[("page:owed", "module:billing")]["comments"][0]["text"], "Moved here")

    def test_the_map_lists_the_designs_a_page_may_take(self):
        tree(self.root, {"designs/invoices.html": "<h1>Invoices</h1>"})
        g = build(self.root, reading=read_map(self.root))
        self.assertEqual([d["file"] for d in g["map"]["designs"]], ["designs/invoices.html"])

    def test_the_map_says_which_wires_a_person_may_draw(self):
        g = build(self.root, reading=read_map(self.root))
        self.assertIn(["feature", "module", "uses"], g["map"]["wiring"])

    def test_no_reading_no_map(self):
        self.assertNotIn("map", build(self.root))


class FreshRead(unittest.TestCase):
    """A map server runs for a whole session, holding the codegraph it started
    with; a refresh reads the repo with codegraph as it is on disk now."""

    def test_a_fresh_read_draws_the_same_map(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tree(root, {"pkg/__init__.py": "# codegraph: module pkg\n# codegraph: front door\n",
                        "pkg/a.py": "# codegraph: module pkg\nimport os\nos.getenv('X')\n"})
            here, fresh = map_of(root), fresh_map_of(root)
            here.pop("generated", None)
            fresh.pop("generated", None)
            self.assertEqual(fresh, json.loads(json.dumps(here)))
