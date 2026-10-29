# codegraph: test module planning
"""Reading plans, and holding each against the map read from the code."""
from __future__ import annotations

import json
import unittest

from modules.planning import compare, left_behind, read_plans
from tests.helpers import Folder, tree


def card(id: str, **more) -> dict:
    kind, _, name = id.partition(":")
    return dict({"id": id, "kind": kind, "label": name}, **more)


# a small map, as the map view draws it
MAP_NODES = [
    card("module:members", door=["find_members"]),
    card("module:mail", door=["send"]),
    card("feature:plan-service", system="calendar"),
    card("page:home", route="/", start=True),
    card("store:members", owner="module:members", fields=["name: text", "email: text"]),
    {"id": "trigger:feature:plan-service:0", "kind": "trigger", "label": "every Thursday at 08:00",
     "dir": "schedule", "feature": "feature:plan-service"},
]
MAP_EDGES = [
    {"from": "feature:plan-service", "to": "module:members", "kind": "uses"},
    {"from": "page:home", "to": "feature:plan-service", "kind": "acts"},
    {"from": "module:members", "to": "store:members", "kind": "writes"},
]


class Plans(Folder):
    def plan(self, name: str, body) -> None:
        tree(self.root, {"plans/{}.json".format(name):
                         body if isinstance(body, str) else json.dumps(body)})

    def one(self, body) -> dict:
        self.plan("p", body)
        return compare(read_plans(self.root), MAP_NODES, MAP_EDGES)[0]

    def test_a_plan_is_named_by_its_file_and_keeps_what_was_asked(self):
        self.plan("reminders", {"ask": "Remind members before they serve.", "cards": []})
        got = compare(read_plans(self.root), MAP_NODES, MAP_EDGES)
        self.assertEqual([(p["name"], p["file"], p["ask"]) for p in got],
                         [("reminders", "plans/reminders.json", "Remind members before they serve.")])

    def test_no_plans_folder_is_no_plans(self):
        self.assertEqual(read_plans(self.root), [])

    def test_a_file_that_is_not_a_plan_says_why_and_is_never_built(self):
        p = self.one("{ not json")
        self.assertFalse(p["built"])
        self.assertTrue(p["problems"])
        p = self.one({"cards": [{"kind": "spaceship", "name": "x"}]})
        self.assertIn("spaceship", " ".join(p["cards"][0]["problems"]))

    def test_a_card_the_map_has_not_got_is_not_built(self):
        p = self.one({"cards": [{"kind": "module", "name": "reminders", "about": "Keeps reminders."}]})
        c = p["cards"][0]
        self.assertEqual((c["id"], c["built"], c["about"]), ("module:reminders", False, "Keeps reminders."))
        self.assertEqual(c["left"], ["not on the map yet"])
        self.assertFalse(p["built"])

    def test_a_module_is_built_once_its_door_has_every_name_asked_for(self):
        p = self.one({"cards": [{"kind": "module", "name": "mail",
                                 "door": ["send", {"name": "bounce", "takes": "an address"}]}]})
        c = p["cards"][0]
        self.assertFalse(c["built"])
        self.assertEqual(c["left"], ["front door lacks bounce"])
        self.assertEqual(c["door"][1], {"name": "bounce", "takes": "an address"})
        p = self.one({"cards": [{"kind": "module", "name": "mail", "door": ["send"]}]})
        self.assertTrue(p["cards"][0]["built"])
        self.assertTrue(p["built"])

    def test_a_feature_must_sit_in_its_system_and_have_its_triggers(self):
        c = self.one({"cards": [{"kind": "feature", "name": "plan-service", "system": "rota",
                                 "triggers": ["schedule every Thursday at 08:00",
                                              "command plan-now"]}]})["cards"][0]
        self.assertEqual(c["left"], ["is in system calendar, not rota", "has no command plan-now"])
        c = self.one({"cards": [{"kind": "feature", "name": "plan-service", "system": "calendar",
                                 "triggers": ["schedule every thursday at 08:00"]}]})["cards"][0]
        self.assertTrue(c["built"], c["left"])

    def test_a_page_must_be_at_its_route(self):
        c = self.one({"cards": [{"kind": "page", "name": "home", "route": "/start"}]})["cards"][0]
        self.assertEqual(c["left"], ["is at /, not /start"])

    def test_a_store_must_have_its_fields_and_its_owner(self):
        c = self.one({"cards": [{"kind": "store", "name": "members", "owner": "mail",
                                 "fields": {"name": "text", "phone": "text"}}]})["cards"][0]
        self.assertEqual(c["left"], ["is owned by members, not mail", "lacks field phone"])

    def test_a_wire_is_built_when_the_map_has_it_by_the_words_context_uses(self):
        p = self.one({"wires": [
            {"from": "page:home", "kind": "acts on", "to": "feature:plan-service"},
            {"from": "feature:plan-service", "kind": "uses", "to": "module:mail"},
        ]})
        self.assertEqual([(w["kind"], w["built"]) for w in p["wires"]], [("acts", True), ("uses", False)])

    def test_wires_are_held_to_the_rules(self):
        p = self.one({
            "cards": [{"kind": "store", "name": "reminders", "owner": "reminders"},
                      {"kind": "module", "name": "reminders"}],
            "wires": [
                {"from": "page:home", "kind": "acts on", "to": "module:mail"},
                {"from": "module:mail", "kind": "writes", "to": "store:reminders"},
                {"from": "module:reminders", "kind": "writes", "to": "store:reminders"},
                {"from": "page:home", "kind": "leads to", "to": "page:nowhere"},
                {"from": "page:home", "kind": "pokes", "to": "page:home"},
            ]})
        why = [" ".join(w["problems"]) for w in p["wires"]]
        self.assertIn("lands on a feature", why[0])
        self.assertIn("only its owner", why[1])
        self.assertEqual(why[2], "")
        self.assertIn("page:nowhere", why[3])
        self.assertIn("pokes", why[4])

    def test_a_planned_feature_needs_a_system_and_a_trigger(self):
        p = self.one({"cards": [{"kind": "feature", "name": "remind"}]})
        why = " ".join(p["cards"][0]["problems"])
        self.assertIn("no system", why)
        self.assertIn("no trigger", why)
        p = self.one({"cards": [{"kind": "feature", "name": "remind", "system": "calendar"},
                                {"kind": "page", "name": "rota"}],
                      "wires": [{"from": "page:rota", "kind": "acts on", "to": "feature:remind"}]})
        self.assertEqual(p["cards"][0]["problems"], [])

    def test_a_built_plan_and_a_broken_file_are_left_behind(self):
        self.plan("done", {"cards": [{"kind": "module", "name": "mail"}]})
        self.plan("waiting", {"cards": [{"kind": "module", "name": "reminders"}]})
        self.plan("broken", "[1, 2]")
        got = left_behind(compare(read_plans(self.root), MAP_NODES, MAP_EDGES))
        self.assertEqual([f for f, _ in got], ["plans/broken.json", "plans/done.json"])
        self.assertIn("delete it", got[1][1])

    def test_what_the_code_cannot_tell_yet_rides_on_the_card(self):
        c = self.one({"cards": [{"kind": "feature", "name": "remind", "system": "calendar",
                                 "program": "server", "roles": ["elder"], "takes": "a week",
                                 "gives": "who was reminded",
                                 "triggers": ["schedule every Monday at 09:00"]}]})["cards"][0]
        self.assertEqual((c["program"], c["roles"], c["takes"], c["gives"]),
                         ("server", ["elder"], "a week", "who was reminded"))
        self.assertEqual(c["problems"], [])


if __name__ == "__main__":
    unittest.main()
