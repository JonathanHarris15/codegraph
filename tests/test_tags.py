# codegraph: test module tags
"""Reading what a file says it belongs to."""
from __future__ import annotations

import unittest

from modules.tags import read_tags


class Tags(unittest.TestCase):
    """Reading what a file says it belongs to."""

    def test_a_module_and_its_front_door(self):
        t = read_tags("# codegraph: module engine\n# codegraph: front door Book, tick\n")
        self.assertEqual((t.kind, t.name, t.door, t.unit),
                         ("module", "engine", ["Book", "tick"], "module:engine"))

    def test_an_empty_front_door(self):
        self.assertEqual(read_tags("# codegraph: module a\n# codegraph: front door\n").door, [])
        self.assertEqual(read_tags("# codegraph: module a\n# codegraph: front door none\n").door, [])

    def test_a_feature_with_its_system_uses_and_triggers(self):
        t = read_tags("// codegraph: feature plan-service in calendar\n"
                         "// codegraph: uses services, members\n"
                         "// codegraph: schedule every day at 08:00\n"
                         "// codegraph: event stripe-paid as PaidEvent\n")
        self.assertEqual((t.kind, t.name, t.system), ("feature", "plan-service", "calendar"))
        self.assertEqual(t.uses, ["services", "members"])
        self.assertEqual(t.schedules, ["every day at 08:00"])
        self.assertEqual(t.events, [("stripe-paid", "PaidEvent")])

    def test_pages_components_and_the_rest(self):
        t = read_tags("// codegraph: start page home at /\n")
        self.assertEqual((t.kind, t.name, t.route, t.start), ("page", "home", "/", True))
        self.assertEqual(read_tags("/* codegraph: component people-picker */").unit,
                         "component:people-picker")
        self.assertEqual(read_tags("// codegraph: design system").unit, "design")
        self.assertEqual(read_tags("# codegraph: tooling").unit, "tooling")

    def test_a_module_may_hold_the_shape_of_its_store(self):
        t = read_tags("# codegraph: module library\n# codegraph: shape of sales\n")
        self.assertEqual((t.kind, t.name, t.shapes), ("module", "library", [("sales", 2)]))

    def test_only_a_module_holds_a_shape(self):
        t = read_tags("// codegraph: page home at /\n// codegraph: shape of sales\n")
        self.assertTrue(any("shape" in text for _, text in t.errors))

    def test_tests_say_what_they_test(self):
        t = read_tags("# codegraph: test module engine")
        self.assertEqual((t.kind, t.of, t.name), ("test", "module", "engine"))
        t = read_tags("// codegraph: test ui home, members")
        self.assertEqual((t.of, t.walks), ("ui", ["home", "members"]))

    def test_a_store_and_what_a_module_reads(self):
        t = read_tags("# codegraph: module m\n# codegraph: store members as Member\n"
                         "# codegraph: reads services\n")
        self.assertEqual((t.stores, t.reads), ([("members", "Member", 2)], ["services"]))

    def test_no_tags_is_none(self):
        self.assertIsNone(read_tags("import os\n# a codegraph comment, not a tag\n"))

    def test_a_tag_must_sit_near_the_top(self):
        self.assertIsNone(read_tags("\n" * 40 + "# codegraph: module late\n"))

    def test_a_tag_that_cannot_be_read(self):
        t = read_tags("# codegraph: modul engine\n")
        self.assertTrue(any("cannot read" in e for _, e in t.errors))

    def test_two_kinds_in_one_file(self):
        t = read_tags("# codegraph: module a\n# codegraph: tooling\n")
        self.assertTrue(any("two tags" in e for _, e in t.errors))

    def test_a_statement_the_kind_cannot_make(self):
        t = read_tags("// codegraph: page home\n// codegraph: front door X\n")
        self.assertTrue(any("only a module" in e for _, e in t.errors))
