# codegraph: test feature check
"""The real app kept in tests/indie-stack, set up for codegraph: the check
finds it clean, and the map reads it as it was built."""
from __future__ import annotations

import unittest
from pathlib import Path

from features.check import check
from features.map import draw_map
from tests.helpers import HAS_SCRIPT

EXAMPLE = Path(__file__).resolve().parent / "indie-stack"


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class IndieStack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = check(EXAMPLE)
        nodes = draw_map(EXAMPLE)["map"]["views"]["map"]["nodes"]
        cls.cards = {n["id"]: n for n in nodes}

    def test_the_check_finds_it_clean(self):
        self.assertEqual([str(m) for m in self.report.mismatches], [])
        self.assertEqual([str(u) for u in self.report.unknown], [])

    def test_every_page_is_at_its_address(self):
        routes = {c["label"]: c["route"] for c in self.cards.values() if c["kind"] == "page"}
        self.assertEqual(routes, {"home": "/", "join": "/join", "login": "/login", "logout": "/logout",
                                  "notes": "/notes", "notes-new": "/notes/new", "note": "/notes/:noteId"})

    def test_what_a_person_asks_for_is_a_feature_in_its_system(self):
        features = {c["label"]: c["system"] for c in self.cards.values() if c["kind"] == "feature"}
        self.assertEqual(features, {"sign-up": "accounts", "log-in": "accounts", "log-out": "accounts",
                                    "write-note": "notes", "delete-note": "notes"})

    def test_the_stores_take_their_fields_from_the_database_schema(self):
        notes = self.cards["store:notes"]
        self.assertEqual(notes["owner"], "module:notes")
        self.assertIn("title: TEXT", notes["fields"])


if __name__ == "__main__":
    unittest.main()
