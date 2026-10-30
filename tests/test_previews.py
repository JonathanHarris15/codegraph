# codegraph: test module previews
"""Finding the pictures UI tests took of each page."""
from __future__ import annotations

import json
import os
import time
import unittest

from modules.previews import preview_file, previews_of
from tests.helpers import Folder, tree


def page(id: str, route: str = "", files: tuple = ()) -> dict:
    return {"id": id, "name": id.partition(":")[2], "route": route, "files": list(files)}


class Previews(Folder):
    def shot(self, name: str, taken: str = "2026-10-29T10:00:00+00:00", **said) -> None:
        """A picture a UI test saved, with what it said about it."""
        shots = self.root / ".codegraph" / "shots"
        shots.mkdir(parents=True, exist_ok=True)
        (shots / (name + ".png")).write_bytes(b"\x89PNG " + name.encode())
        said = dict({"picture": ".codegraph/shots/" + name + ".png", "taken": taken}, **said)
        (shots / (name + ".json")).write_text(json.dumps(said), encoding="utf-8")

    def test_a_picture_lands_on_the_page_its_address_reaches(self):
        self.shot("a", url="http://localhost:3000/notes/42?tab=1")
        found = previews_of(self.root, [page("page:notes", "/notes"), page("page:note", "/notes/[id]")])
        self.assertEqual(list(found), ["page:note"])
        self.assertEqual(found["page:note"]["picture"], ".codegraph/shots/a.png")
        self.assertEqual(found["page:note"]["url"], "/notes/42")

    def test_a_written_route_beats_one_that_takes_any_part(self):
        self.shot("a", url="/notes/new")
        found = previews_of(self.root, [page("page:note", "/notes/[id]"), page("page:new", "/notes/new")])
        self.assertEqual(list(found), ["page:new"])

    def test_a_test_can_name_the_page_where_it_has_no_route(self):
        self.shot("a", url="/notes/new", page="notes-new")
        found = previews_of(self.root, [page("page:notes-new")])
        self.assertEqual(list(found), ["page:notes-new"])

    def test_the_newest_picture_of_a_page_wins(self):
        self.shot("old", url="/", taken="2026-10-01T10:00:00+00:00")
        self.shot("new", url="/", taken="2026-10-20T10:00:00+00:00")
        found = previews_of(self.root, [page("page:home", "/")])
        self.assertEqual(found["page:home"]["picture"], ".codegraph/shots/new.png")
        self.assertEqual(found["page:home"]["taken"], "2026-10-20T10:00:00+00:00")

    def test_a_picture_is_stale_once_its_page_changed_after(self):
        tree(self.root, {"app/home.tsx": "export default 1\n"})
        home = self.root / "app" / "home.tsx"
        self.shot("a", url="/", taken="2026-10-29T10:00:00+00:00")
        os.utime(home, (time.time(), time.time()))
        found = previews_of(self.root, [page("page:home", "/", [home])])
        self.assertTrue(found["page:home"]["stale"])
        os.utime(home, (0, 0))
        self.assertFalse(previews_of(self.root, [page("page:home", "/", [home])])["page:home"]["stale"])

    def test_no_pictures_no_previews(self):
        self.assertEqual(previews_of(self.root, [page("page:home", "/")]), {})

    def test_a_picture_kept_elsewhere_in_the_repo_is_found(self):
        tree(self.root, {"cypress/screenshots/smoke/home.png": "png"})
        self.shot("a", url="/", picture=str(self.root / "cypress/screenshots/smoke/home.png"))
        found = previews_of(self.root, [page("page:home", "/")])
        self.assertEqual(found["page:home"]["picture"], "cypress/screenshots/smoke/home.png")

    def test_what_cannot_be_read_is_passed_over(self):
        shots = self.root / ".codegraph" / "shots"
        shots.mkdir(parents=True)
        (shots / "torn.json").write_text("{", encoding="utf-8")
        (shots / "list.json").write_text("[]", encoding="utf-8")
        self.shot("gone", url="/", picture=".codegraph/shots/nothing.png")
        self.shot("away", url="/", picture="../outside.png")
        self.assertEqual(previews_of(self.root, [page("page:home", "/")]), {})

    def test_only_a_picture_a_test_took_is_served(self):
        self.shot("a", url="/")
        tree(self.root, {"secret.png": "keep out", "app/home.tsx": "x"})
        self.assertEqual(preview_file(self.root, ".codegraph/shots/a.png"), (b"\x89PNG a", "image/png"))
        self.assertIsNone(preview_file(self.root, "secret.png"))
        self.assertIsNone(preview_file(self.root, ".codegraph/shots/a.json"))
        self.assertIsNone(preview_file(self.root, "../a.png"))


if __name__ == "__main__":
    unittest.main()
