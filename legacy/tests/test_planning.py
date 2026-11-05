# codegraph: test module planning
"""Reading plans, and holding each against the map read from the code."""
from __future__ import annotations

import json
import unittest

import base64

from modules.planning import (compare, design_file, designs_in, drawable_wires, left_behind, read_plans,
                              write_plan)
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

    def test_a_design_is_left_until_the_agent_takes_it_off_the_card(self):
        c = self.one({"cards": [{"kind": "page", "name": "home",
                                 "design": "plans/p/home.png"}]})["cards"][0]
        self.assertFalse(c["built"])
        self.assertIn("design codegraph cannot check", c["left"][0])

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

    def test_a_system_is_built_once_a_feature_on_the_map_sits_in_it(self):
        # a person names a system and says what its features are for; the
        # agent works out the features
        p = self.one({"cards": [{"kind": "system", "name": "billing", "about": "Invoices and reminders"}]})
        c = p["cards"][0]
        self.assertEqual((c["id"], c["problems"], c["left"], c["built"]),
                         ("system:billing", [], ["not on the map yet"], False))
        p = self.one({"cards": [{"kind": "system", "name": "calendar"}]})
        self.assertTrue(p["cards"][0]["built"])

    def test_the_wires_a_person_may_draw_between_two_kinds_of_card(self):
        words = {(a, b): w for a, b, w in drawable_wires()}
        self.assertEqual(words[("feature", "module")], "uses")
        self.assertEqual(words[("page", "feature")], "acts on")
        self.assertEqual(words[("page", "module")], "informed by")
        self.assertEqual(words[("page", "page")], "leads to")
        self.assertEqual(words[("module", "store")], "writes")
        self.assertNotIn(("module", "feature"), words)
        self.assertNotIn(("page", "store"), words)

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


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def data_url(kind: str, raw: bytes) -> str:
    return "data:{};base64,{}".format(kind, base64.b64encode(raw).decode())


class Writing(Folder):
    """A plan drawn on the map, written where the agent and the map read it."""

    def test_a_drawn_plan_and_its_designs_are_written_beside_each_other(self):
        rel = write_plan(self.root, "rota-pages",
                         {"ask": "A rota", "cards": [{"kind": "page", "name": "rota",
                                                      "design": "plans/rota-pages/rota.png"}]},
                         {"rota.png": data_url("image/png", PNG),
                          "week.html": data_url("text/html", b"<h1>week</h1>")})
        self.assertEqual(rel, "plans/rota-pages.json")
        self.assertEqual((self.root / "plans/rota-pages/rota.png").read_bytes(), PNG)
        p = compare(read_plans(self.root), [], [])[0]
        self.assertEqual(p["cards"][0]["design"], "plans/rota-pages/rota.png")
        self.assertEqual(p["designs"], "plans/rota-pages/")

    def test_a_drawn_plan_keeps_the_drawing_as_the_person_left_it(self):
        drawn = {"ask": "Billing", "drawn": True,
                 "cards": [{"kind": "feature", "name": "chase", "system": "billing", "about": "Chase late payers"}],
                 "wires": [{"from": "feature:chase", "kind": "uses", "to": "module:mail", "about": "to email them"}],
                 "comments": [{"on": "feature:chase", "by": "person", "text": "Weekly or monthly?"}]}
        write_plan(self.root, "billing", drawn, {})
        kept = json.loads((self.root / "plans/billing.json").read_text(encoding="utf-8"))
        self.assertEqual(kept["drawing"], {"cards": drawn["cards"], "wires": drawn["wires"]})

    def test_a_reviewed_plan_says_what_the_agent_changed_in_the_drawing(self):
        drawing = {"cards": [{"kind": "feature", "name": "chase", "system": "billing", "about": "Chase late payers"},
                             {"kind": "module", "name": "dunning", "about": "Sends the chasers"}],
                   "wires": [{"from": "feature:chase", "kind": "uses", "to": "module:dunning"}]}
        tree(self.root, {"plans/billing.json": json.dumps({
            "drawn": True, "reviewed": True, "drawing": drawing,
            "cards": [{"kind": "feature", "name": "chase", "system": "billing",
                       "about": "Chase late payers every Monday", "triggers": ["schedule every Monday"]},
                      {"kind": "page", "name": "owed", "about": "Who owes what"}],
            "wires": [{"from": "feature:chase", "kind": "uses", "to": "module:mail"}],
            "comments": [{"on": "module:dunning", "by": "agent", "text": "mail already sends email"},
                         {"on": "feature:chase", "by": "person", "text": "Weekly or monthly?"}]})})
        p = compare(read_plans(self.root), MAP_NODES, MAP_EDGES)[0]
        cards = {c["id"]: c for c in p["cards"]}
        self.assertEqual((cards["feature:chase"]["change"], cards["feature:chase"]["was"]),
                         ("changed", {"about": "Chase late payers"}))
        self.assertEqual(cards["page:owed"]["change"], "added")
        self.assertEqual([c["id"] for c in p["struck"]], ["module:dunning"])
        self.assertEqual([w["change"] for w in p["wires"]], ["added"])
        self.assertEqual([(w["from"], w["to"]) for w in p["struck_wires"]], [("feature:chase", "module:dunning")])
        self.assertEqual([c["by"] for c in p["comments"]], ["agent", "person"])

    def test_a_drawing_not_yet_reviewed_shows_no_changes(self):
        tree(self.root, {"plans/billing.json": json.dumps({
            "drawn": True, "drawing": {"cards": [{"kind": "module", "name": "dunning"}], "wires": []},
            "cards": [{"kind": "module", "name": "dunning"}]})})
        p = compare(read_plans(self.root), MAP_NODES, MAP_EDGES)[0]
        self.assertEqual((p["cards"][0].get("change"), p["struck"]), (None, []))

    def test_a_name_or_a_file_that_could_land_elsewhere_is_refused(self):
        for name in ("../x", "Rota Pages", "", "a/b"):
            with self.assertRaises(ValueError):
                write_plan(self.root, name, {"cards": []}, {})
        for file in ("../evil.png", "x.exe", ".png", "a/b.png"):
            with self.assertRaises(ValueError):
                write_plan(self.root, "ok", {"cards": []}, {file: data_url("image/png", PNG)})
        self.assertFalse((self.root / "plans").exists())

    def test_a_plan_already_waiting_is_not_written_over(self):
        write_plan(self.root, "rota", {"cards": []}, {})
        with self.assertRaises(ValueError):
            write_plan(self.root, "rota", {"cards": []}, {})

    def test_a_built_plan_with_designs_says_to_delete_them_too(self):
        write_plan(self.root, "done", {"cards": []}, {"a.png": data_url("image/png", PNG)})
        (_, why), = left_behind(compare(read_plans(self.root), [], []))
        self.assertIn("plans/done/", why)

    def test_a_design_is_served_only_from_inside_plans(self):
        write_plan(self.root, "rota", {"cards": []}, {"rota.png": data_url("image/png", PNG)})
        self.assertEqual(design_file(self.root, "plans/rota/rota.png"), (PNG, "image/png"))
        tree(self.root, {"secret.png": "x", "plans/notes.txt": "x"})
        for rel in ("secret.png", "plans/../secret.png", "plans/notes.txt", "plans/rota/none.png"):
            self.assertIsNone(design_file(self.root, rel), rel)

    def test_the_designs_folder_holds_the_pages_exported_from_claude_design(self):
        tree(self.root, {"designs/invoices.html": "<h1>Invoices</h1>", "designs/home.png": "x",
                         "designs/rota/index.html": "<h1>Rota</h1>", "designs/rota/app.js": "x",
                         "designs/notes.txt": "x"})
        self.assertEqual(designs_in(self.root), [
            {"file": "designs/home.png", "name": "home", "type": "image"},
            {"file": "designs/invoices.html", "name": "invoices", "type": "text/html"},
            {"file": "designs/rota/index.html", "name": "rota", "type": "text/html"}])
        self.assertEqual(design_file(self.root, "designs/invoices.html"), (b"<h1>Invoices</h1>", "text/html"))
        self.assertIsNone(design_file(self.root, "designs/../secret.png"))

    def test_no_designs_folder_is_no_designs(self):
        self.assertEqual(designs_in(self.root), [])


if __name__ == "__main__":
    unittest.main()
