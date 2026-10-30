# codegraph: test module snapshots
# The browser page is a stand-in, as no browser runs beside the unit tests.
"""The helper a repo's Playwright tests call, read back the way the map reads it."""
from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

from modules.previews import previews_of
from tests.helpers import Folder

HELPER = Path(__file__).resolve().parents[1] / "modules" / "snapshots" / "playwright.mjs"

# A page as Playwright hands one to a test: where it is, and a screenshot it saves.
RUN = """
import { writeFileSync } from 'node:fs'
import { snapshot } from %s
const page = { url: () => %s, screenshot: async ({ path }) => writeFileSync(path, 'png') }
await snapshot(page, %s)
"""


@unittest.skipUnless(shutil.which("node"), "needs node")
class Snapshot(Folder):
    def take(self, url: str, name: str = "") -> None:
        script = RUN % (json.dumps(HELPER.as_uri()), json.dumps(url), json.dumps(name))
        subprocess.run(["node", "--input-type=module", "-e", script], cwd=self.root, check=True,
                       capture_output=True, timeout=60)

    def test_the_map_finds_a_picture_by_the_address_it_was_taken_at(self):
        self.take("http://localhost:3000/notes/42")
        found = previews_of(self.root, [{"id": "page:note", "name": "note", "route": "/notes/[id]",
                                         "files": []}])
        self.assertEqual(found["page:note"]["picture"], ".codegraph/shots/notes_42.png")
        self.assertEqual(found["page:note"]["url"], "/notes/42")

    def test_a_named_page_is_found_by_its_name(self):
        self.take("http://localhost:3000/notes/new", "notes-new")
        found = previews_of(self.root, [{"id": "page:notes-new", "name": "notes-new", "route": "",
                                         "files": []}])
        self.assertEqual(found["page:notes-new"]["picture"], ".codegraph/shots/notes-new.png")

    def test_a_later_picture_of_a_page_takes_the_last_ones_place(self):
        self.take("http://localhost:3000/")
        self.take("http://localhost:3000/")
        self.assertEqual(sorted(p.name for p in (self.root / ".codegraph" / "shots").iterdir()),
                         ["start.json", "start.png"])


if __name__ == "__main__":
    unittest.main()
