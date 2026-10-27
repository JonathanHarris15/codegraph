# codegraph: test module drafting
"""A first set of tags, made from what the code does today."""
from __future__ import annotations

import json

from features.check import check
from modules.drafting import draft_tags, write_drafts
from modules.tags import insert_tags
from tests.helpers import Folder, HAS_SCRIPT, tree


class Drafting(Folder):
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
        self.drafts = draft_tags(self.root)

    def test_one_module_per_folder_with_its_door_on_the_folders_own_file(self):
        self.assertEqual(self.drafts["engine/book.py"], ["module engine"])
        self.assertEqual(self.drafts["engine/__init__.py"], ["module engine", "front door Book"])

    def test_tests_and_tooling_are_found_by_their_names(self):
        self.assertEqual(self.drafts["tests/test_book.py"], ["test module engine"])
        self.assertEqual(self.drafts["setup.py"], ["tooling"])

    def test_a_generic_folder_name_gives_way_to_its_parent(self):
        tree(self.root, {"packages/core/src/index.py": "", "packages/web/src/main.py": "",
                         "packages/web/build.py": ""})
        d = draft_tags(self.root)
        self.assertEqual(d["packages/core/src/index.py"][0], "module core")
        # two folders that would both be "web" keep their paths apart
        self.assertEqual(d["packages/web/src/main.py"][0], "module packages/web/src")

    def test_written_into_the_files_the_draft_passes_except_where_tests_reach_in(self):
        write_drafts(self.root, self.drafts)
        self.assertTrue((self.root / "app/main.py").read_text().startswith(
            "#!/usr/bin/env python\n# codegraph: module app\n"))
        r = check(self.root)
        self.assertEqual(sorted({m.rel for m in r.mismatches}), ["tests/test_book.py"])
        self.assertEqual(draft_tags(self.root), {})          # nothing left to tag

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
        d = draft_tags(self.root)
        self.assertEqual(d["src/features/calendar/plan.ts"][0], "feature plan in calendar")
        self.assertEqual(d["src/app/page.tsx"], ["start page home"])
        self.assertEqual(d["src/app/members/page.tsx"], ["page members"])
        self.assertEqual(d["src/components/PeoplePicker.tsx"], ["component people-picker"])
        self.assertEqual(d["src/components/ui/button.tsx"], ["design system"])
        self.assertEqual(d["e2e/walk.spec.ts"], ["test ui"])

    def test_an_old_declaration_seeds_the_modules(self):
        (self.root / "codegraph.json").write_text(json.dumps({"modules": {
            "core": {"files": ["engine/*", "app/*"], "front_door": ["Book", "_fill"]}}}))
        d = draft_tags(self.root)
        self.assertEqual(d["app/main.py"], ["module core"])
        self.assertIn("front door Book, _fill", sum(d.values(), []))

    def test_stores_the_modules_reach(self):
        tree(self.root, {"engine/db.py": "def save(c): c.execute('INSERT INTO books VALUES (1)')\n",
                         "app/report.py": "def r(c): c.execute('SELECT * FROM books')\n"})
        d = draft_tags(self.root)
        self.assertIn("store books", d["engine/db.py"])
        self.assertIn("reads books", d["app/report.py"])

    def test_tags_go_after_use_client(self):
        self.assertEqual(insert_tags('"use client";\nexport {}\n', ["component x"], "//"),
                         '"use client";\n// codegraph: component x\nexport {}\n')
