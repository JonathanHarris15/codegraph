# codegraph: test feature browse-map
"""The map as a live page: served with its mismatches, saying what is asked
from it, and drawn again from the code on a refresh."""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request

from features.browse import browse
from tests.helpers import Folder, mod, tree


class LiveMap(Folder):
    def setUp(self):
        super().setUp()
        tree(self.root, {"engine/__init__.py": mod("engine", "Book") + "class Book: pass\n"})
        self.said: list = []
        self.server = browse(self.root, say=self.said.append)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def get(self, path: str = "") -> str:
        with urllib.request.urlopen(self.server.url + path, timeout=10) as r:
            return r.read().decode()

    def post(self, path: str, body: dict) -> None:
        req = urllib.request.Request(self.server.url + path, data=json.dumps(body).encode(), method="POST")
        urllib.request.urlopen(req, timeout=10).close()

    def test_it_says_where_it_is_first(self):
        self.assertEqual(json.loads(self.said[0]), {"ready": self.server.url})

    def test_the_page_carries_the_map_and_how_to_talk_back(self):
        page = self.get()
        self.assertIn('"module:engine"', page)
        self.assertIn('"ask": "/{}/ask"'.format(self.server.secret), page)

    def test_what_is_asked_is_said_as_a_line(self):
        self.post("ask", {"text": "Build a new feature: "})
        self.assertEqual(json.loads(self.said[-1]), {"ask": "Build a new feature: "})

    def test_a_refresh_draws_the_new_code(self):
        tree(self.root, {"engine/gate.py": mod("engine") + "def _open(): pass\n",
                         "tools/peek.py": mod("tools", "") + "from engine.gate import _open\n"})
        self.assertNotIn("_open", self.get())
        self.post("refresh", {})
        self.assertIn("not on its front door", self.get())

    def test_the_picture_a_ui_test_took_is_served_and_nothing_else(self):
        tree(self.root, {".codegraph/shots/home.png": "png", "secret.png": "keep out",
                         ".codegraph/shots/home.json": json.dumps(
                             {"url": "/", "picture": ".codegraph/shots/home.png"})})
        self.assertEqual(self.get("design/.codegraph/shots/home.png"), "png")
        with self.assertRaises(urllib.error.HTTPError):
            self.get("design/secret.png")

    def test_a_plan_drawn_on_the_map_is_written_and_drawn_back(self):
        self.post("plan", {"name": "next", "plan": {"ask": "A mail module",
                                                    "cards": [{"kind": "module", "name": "mail"}]},
                           "designs": {}})
        self.assertTrue((self.root / "plans/next.json").exists())
        self.post("refresh", {})
        self.assertIn('"plan": "next"', self.get())


    def test_cards_drawn_by_hand_come_back_as_ghosts_with_their_design(self):
        # what the map sends after a right click made a module, a feature
        # inside a system's box, and a page from a Claude Design file
        page = "data:text/html;base64,PGgxPkludm9pY2VzPC9oMT4="
        self.post("plan", {"name": "invoices", "designs": {"invoices.html": page}, "plan": {
            "ask": "Invoices", "drawn": True,
            "cards": [{"kind": "module", "name": "billing", "about": "Keeps invoices"},
                      {"kind": "feature", "name": "remind", "system": "money", "about": "Monthly reminders"},
                      {"kind": "page", "name": "invoices", "about": "Every invoice",
                       "design": "plans/invoices/invoices.html"}],
            "wires": [{"from": "page:invoices", "kind": "leads to", "to": "page:invoices"}]}})
        self.assertTrue((self.root / "plans/invoices/invoices.html").exists())
        self.post("refresh", {})
        drawn = self.get()
        for card in ('"module:billing"', '"feature:remind"', '"page:invoices"', '"Monthly reminders"'):
            self.assertIn(card, drawn)
