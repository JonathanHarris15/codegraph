# codegraph: test feature check
"""The check: every rule, run on small codebases."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from features.check import check
from modules.rules import read_map, route_of
from tests.helpers import Folder, HAS_SCRIPT, mod, tree


class Project(Folder):
    """A fresh folder, and the check run on what is written into it."""

    def check(self, files: dict):
        tree(self.root, files)
        return check(self.root)


class FrontDoors(Project):
    """The check: a module's front door says which names may cross into it."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "engine/__init__.py": mod("engine", "Book"),
            "engine/book.py": mod("engine") + "class Book: pass\ndef _fill(): pass\n",
            "app/__init__.py": mod("app", ""),
        })

    def app(self, source: str):
        return self.check({"app/main.py": mod("app") + source})

    def test_a_front_door_name_passes(self):
        self.assertEqual(self.app("from engine.book import Book\n").mismatches, [])

    def test_a_name_behind_the_door_is_a_mismatch(self):
        r = self.app("from engine.book import _fill\n")
        self.assertEqual(len(r.mismatches), 1)
        m = r.mismatches[0]
        self.assertEqual((m.rel, m.line), ("app/main.py", 2))
        self.assertIn("_fill", m.text)
        self.assertIn("engine", m.text)

    def test_the_path_an_import_takes_does_not_matter(self):
        r = self.check({
            "engine/__init__.py": mod("engine", "Book") + "from .book import Book\n",
            "app/main.py": mod("app") + "from engine import Book\n",
        })
        self.assertEqual(r.mismatches, [])

    def test_a_name_reached_through_an_alias(self):
        r = self.app("import engine.book as b\nb._fill()\n")
        self.assertEqual([(m.line, "_fill" in m.text) for m in r.mismatches], [(3, True)])

    def test_a_name_reached_through_the_full_dotted_path(self):
        self.assertEqual(len(self.app("import engine.book\nengine.book._fill()\n").mismatches), 1)

    def test_a_file_imported_by_name_then_used(self):
        r = self.app("from engine import book\nbook._fill()\nbook.Book()\n")
        self.assertEqual([m.line for m in r.mismatches], [3])

    def test_inside_a_module_anything_goes(self):
        r = self.check({"engine/other.py": mod("engine") + "from engine.book import _fill\n"})
        self.assertEqual(r.mismatches, [])

    def test_import_star_is_unknown_not_guessed(self):
        r = self.app("from engine.book import *\n")
        self.assertEqual((r.mismatches, len(r.unknown)), ([], 1))

    def test_a_module_passed_around_whole_is_unknown(self):
        r = self.app("import engine.book as b\nrun(b)\n")
        self.assertEqual((r.mismatches, [u.line for u in r.unknown]), ([], [3]))

    def test_third_party_and_stdlib_are_not_checked(self):
        r = self.app("import os\nfrom httpx import Client\n")
        self.assertEqual((r.mismatches, r.unknown), ([], []))

    def test_a_file_with_no_tag(self):
        r = self.check({"loose.py": ""})
        self.assertEqual([m.rel for m in r.mismatches], ["loose.py"])
        self.assertIn("no codegraph tag", r.mismatches[0].text)

    def test_a_module_with_no_front_door(self):
        r = self.check({"util/a.py": mod("util")})
        self.assertTrue(self.has(r.mismatches, "module util", "no front door"))

    def test_a_front_door_written_twice(self):
        r = self.check({"util/a.py": mod("util", "x"), "util/b.py": mod("util", "y")})
        self.assertTrue(self.has(r.mismatches, "more than one file"))

    def test_a_module_test_goes_through_the_front_door_too(self):
        r = self.check({"tests/test_book.py": "# codegraph: test module engine\n"
                                              "from engine.book import _fill\n"})
        self.assertEqual([m.rel for m in r.mismatches], ["tests/test_book.py"])

    def test_a_test_through_the_front_door_passes(self):
        r = self.check({"tests/test_book.py": "# codegraph: test module engine\n"
                                              "from engine.book import Book\n"})
        self.assertEqual(r.mismatches, [])

    def test_a_test_of_something_that_is_not_there(self):
        r = self.check({"tests/test_x.py": "# codegraph: test module ghost\n"})
        self.assertTrue(self.has(r.mismatches, "ghost", "not a module"))

    def test_the_program_never_imports_a_test(self):
        r = self.check({
            "tests/helpers.py": "# codegraph: test module engine\ndef make(): pass\n",
            "app/main.py": mod("app") + "from tests.helpers import make\n",
        })
        self.assertTrue(any(m.rel == "app/main.py" and "never imports a test" in m.text
                            for m in r.mismatches))


class Layers(Project):
    """Modules, features and the UI, and which way each may reach."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "members/__init__.py": mod("members", "find, add"),
            "members/store.py": mod("members") + "def find(): pass\ndef add(): pass\n",
            "features/join.py": ("# codegraph: feature join in people\n"
                                 "# codegraph: uses members\n"
                                 "# codegraph: event signed-up\n"
                                 "from members.store import add\n"),
        })

    def test_a_feature_through_a_declared_module_passes(self):
        r = self.check({})
        self.assertEqual(r.mismatches, [])

    def test_a_module_never_calls_a_feature(self):
        r = self.check({"members/hook.py": mod("members") + "from features.join import x\n"})
        self.assertTrue(self.has(r.mismatches, "never calls a feature"))

    def test_a_feature_must_say_which_modules_it_uses(self):
        r = self.check({
            "billing/__init__.py": mod("billing", "charge") + "def charge(): pass\n",
            "features/pay.py": ("# codegraph: feature pay in money\n# codegraph: event paid\n"
                                "from billing import charge\n"),
        })
        self.assertTrue(self.has(r.mismatches, "feature pay", "without saying so"))

    def test_a_feature_that_says_it_uses_a_module_it_does_not(self):
        r = self.check({"features/idle.py": ("# codegraph: feature idle in people\n"
                                             "# codegraph: uses members\n"
                                             "# codegraph: event x\n")})
        self.assertTrue(self.has(r.mismatches, "feature idle", "never does"))

    def test_a_feature_never_calls_another(self):
        r = self.check({"features/leave.py": ("# codegraph: feature leave in people\n"
                                              "# codegraph: event left\n"
                                              "from features.join import x\n")})
        self.assertTrue(self.has(r.mismatches, "never calls another feature"))

    def test_a_feature_names_its_system(self):
        r = self.check({"features/x.py": "# codegraph: feature x\n# codegraph: event e\n"})
        self.assertTrue(self.has(r.mismatches, "feature x", "names no system"))

    def test_a_feature_with_no_trigger(self):
        r = self.check({"features/x.py": "# codegraph: feature x in people\n"})
        self.assertTrue(self.has(r.mismatches, "feature x", "no trigger"))

    def test_a_page_that_acts_on_a_feature_is_its_trigger(self):
        r = self.check({
            "features/x.py": "# codegraph: feature x in people\n",
            "ui/home.py": "# codegraph: start page home\nfrom features.x import go\n",
            "tests/test_ui.py": "# codegraph: test ui home\n",
        })
        self.assertEqual(r.mismatches, [])

    def test_a_page_may_show_a_module_through_its_door(self):
        r = self.check({"ui/home.py": "# codegraph: start page home\nfrom members.store import find\n",
                        "tests/test_ui.py": "# codegraph: test ui home\n"})
        self.assertEqual(r.mismatches, [])

    def test_a_page_reaching_past_a_door(self):
        tree(self.root, {"members/store.py": mod("members") + "def find(): pass\ndef _raw(): pass\n"})
        r = self.check({"ui/home.py": "# codegraph: start page home\nfrom members.store import _raw\n",
                        "tests/test_ui.py": "# codegraph: test ui home\n"})
        self.assertTrue(self.has(r.mismatches, "_raw", "front door"))

    def test_a_page_never_imports_a_page(self):
        r = self.check({"ui/a.py": "# codegraph: start page a\nfrom ui.b import x\n",
                        "ui/b.py": "# codegraph: page b\n"})
        self.assertTrue(self.has(r.mismatches, "never imports another page"))

    def test_a_component_never_contains_a_page(self):
        r = self.check({"ui/c.py": "# codegraph: component c\nfrom ui.b import x\n",
                        "ui/b.py": "# codegraph: start page b\n"})
        self.assertTrue(self.has(r.mismatches, "never contains a page"))

    def test_the_design_system_has_no_wires(self):
        r = self.check({"ui/button.py": "# codegraph: design system\nfrom members.store import find\n"})
        self.assertTrue(self.has(r.mismatches, "design system has no wires"))

    def test_the_program_never_imports_tooling(self):
        r = self.check({"build.py": "# codegraph: tooling\n",
                        "members/x.py": mod("members") + "import build\n"})
        self.assertTrue(self.has(r.mismatches, "never imports tooling"))

    def test_only_a_module_reaches_outside(self):
        r = self.check({"features/join.py": ("# codegraph: feature join in people\n"
                                             "# codegraph: uses members\n# codegraph: event e\n"
                                             "import httpx\nfrom members.store import add\n"
                                             "httpx.get('https://api.example.com/x')\n")})
        self.assertTrue(self.has(r.mismatches, "api.example.com", "only a module"))

    def test_tooling_and_a_server_may_reach_outside(self):
        r = self.check({"deploy.py": "# codegraph: tooling\nimport httpx\nhttpx.get('https://x.io')\n",
                        "features/api.py": ("# codegraph: feature api in people\n"
                                            "# codegraph: event request\n"
                                            "from fastapi import FastAPI\napp = FastAPI()\n")})
        self.assertEqual(r.mismatches, [])


class Stores(Project):
    """A store has one owning module, its shape read from a schema."""

    def setUp(self):
        super().setUp()
        tree(self.root, {
            "members/__init__.py": mod("members", "add"),
            "members/model.py": (mod("members") + "# codegraph: store members\n"
                                 "from pydantic import BaseModel\n"
                                 "class Member(BaseModel):\n    name: str\n    age: int\n"),
            "members/db.py": mod("members") + "def add(c): c.execute('INSERT INTO members VALUES (?)')\n",
        })

    def test_the_owner_writes_its_store(self):
        r = read_map(self.root)
        self.assertEqual(r.mismatches, [])
        self.assertEqual(r.stores["members"]["schema"].lines(), ["name: str", "age: int"])
        self.assertIn(("module:members", "store:members", "writes"), r.wires)

    def test_a_store_with_no_schema(self):
        r = self.check({"jobs/__init__.py": mod("jobs", "") + "# codegraph: store jobs\n"})
        self.assertTrue(self.has(r.mismatches, "store jobs", "no schema"))

    def test_a_store_named_after_a_schema_it_cannot_find(self):
        r = self.check({"jobs/__init__.py": mod("jobs", "") + "# codegraph: store jobs as Job\n"})
        self.assertTrue(self.has(r.mismatches, "store jobs", "Job"))

    def test_a_store_owned_twice(self):
        r = self.check({"other/__init__.py": mod("other", "") + "# codegraph: store members\n"})
        self.assertTrue(self.has(r.mismatches, "store members", "one owning module"))

    def test_another_module_never_writes_it(self):
        r = self.check({"other/__init__.py": mod("other", "") +
                        "def x(c): c.execute('UPDATE members SET name = 1')\n"})
        self.assertTrue(self.has(r.mismatches, "writes store members", "only its owner"))

    def test_sql_in_a_comment_or_docstring_is_not_a_call(self):
        r = self.check({"other/__init__.py": mod("other", "") +
                        '"""Holds rows:\n\n    CREATE TABLE notes (id INTEGER)\n"""\n'
                        "# DELETE FROM members, once\n"
                        "def x():\n    '''UPDATE members SET name = 1'''\n"})
        self.assertEqual(r.mismatches, [])

    @unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
    def test_sql_in_a_script_comment_is_not_a_call(self):
        r = self.check({"other/index.ts": mod("other", "").replace("#", "//") +
                        "// DELETE FROM members\n/* UPDATE members SET name = 1 */\n"
                        "export const q = 'SELECT name FROM notes';\n"})
        self.assertTrue(self.has(r.mismatches, "reaches notes"))
        self.assertFalse(self.has(r.mismatches, "members"))

    def test_a_declared_reader_may_read_it(self):
        r = self.check({"report/__init__.py": mod("report", "") + "# codegraph: reads members\n"
                        "def x(c): c.execute('SELECT name FROM members')\n"})
        self.assertEqual(r.mismatches, [])

    def test_an_undeclared_reader(self):
        r = self.check({"report/__init__.py": mod("report", "") +
                        "def x(c): c.execute('SELECT name FROM members')\n"})
        self.assertTrue(self.has(r.mismatches, "reads store members", "without saying so"))

    def test_a_feature_never_reaches_a_store(self):
        r = self.check({"features/x.py": ("# codegraph: feature x in people\n# codegraph: event e\n"
                                          "def go(db): db.collection('members').add({})\n")})
        self.assertTrue(self.has(r.mismatches, "store members directly"))

    def test_a_collection_that_is_no_store(self):
        r = self.check({"other/__init__.py": mod("other", "") +
                        "def x(db): db.collection('ghosts').get()\n"})
        self.assertTrue(self.has(r.mismatches, "ghosts", "not a declared store"))


class PageMap(Project):
    """Where a person can go: pages, their links, and the start page."""

    def pages(self, files: dict):
        tree(self.root, dict({"tests/walk.py": "# codegraph: test ui home, members, member\n"}, **files))
        return read_map(self.root)

    def test_a_link_leads_to_the_page_at_its_route(self):
        r = self.pages({"web/app/page.tsx": "// codegraph: start page home\n<a href=\"/members\">",
                        "web/app/members/page.tsx": "// codegraph: page members\n"})
        self.assertIn(("page:home", "page:members", "leads"), r.wires)
        self.assertEqual(r.units["page:members"].route, "/members")
        self.assertFalse(self.has(r.mismatches, "cannot be reached"))

    def test_a_link_with_a_value_filled_in_matches_a_route_with_a_slot(self):
        r = self.pages({"web/app/page.tsx": "// codegraph: start page home\n"
                                            "router.push(`/members/${id}`)\n",
                        "web/app/members/[id]/page.tsx": "// codegraph: page member\n"})
        self.assertIn(("page:home", "page:member", "leads"), r.wires)

    def test_a_login_page_leads_where_it_sends_people_after_signing_in(self):
        for line in ('signIn("credentials", { callbackUrl: "/members" })',
                     "supabase.auth.signInWithOAuth({ options: { redirectTo: '/members' } })",
                     '<SignIn forceRedirectUrl="/members" />',
                     'throw redirect(303, "/members")',
                     'navigate({ to: "/members" })',
                     'window.location.assign("/members")',
                     'return RedirectResponse(url="/members")',
                     'return HttpResponseRedirect("/members")'):
            with self.subTest(line):
                r = self.pages({"web/login.tsx": "// codegraph: start page login at /login\n" + line,
                                "web/members.tsx": "// codegraph: page members at /members\n"})
                self.assertIn(("page:login", "page:members", "leads"), r.wires)
                self.assertFalse(self.has(r.unknown, "builds a link"))

    def test_a_link_built_while_running_cannot_be_told(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n<Link href={url}>"})
        self.assertTrue(self.has(r.unknown, "builds a link"))

    def test_a_page_nothing_leads_to(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n",
                        "web/members.tsx": "// codegraph: page members at /members\n"})
        self.assertTrue(self.has(r.mismatches, "page members", "cannot be reached"))

    def test_no_start_page(self):
        r = self.pages({"web/home.tsx": "// codegraph: page home at /\n"})
        self.assertTrue(self.has(r.mismatches, "no page is a start page"))

    def test_a_components_links_belong_to_its_pages(self):
        if not HAS_SCRIPT:
            self.skipTest("tree-sitter is not installed")
        r = self.pages({"web/home.tsx": ("// codegraph: start page home at /\n"
                                         "import { Nav } from './nav';\n"),
                        "web/nav.tsx": "// codegraph: component nav\n<a href='/members'>",
                        "web/members.tsx": "// codegraph: page members at /members\n"})
        self.assertIn(("page:home", "page:members", "leads"), r.wires)

    def test_a_page_no_ui_test_walks(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n",
                        "web/about.tsx": "// codegraph: page about at /about\n"})
        self.assertTrue(self.has(r.mismatches, "no UI test walks page about"))

    def test_routes_from_the_framework(self):
        self.assertEqual(route_of("app/(shop)/cart/page.tsx"), "/cart")
        self.assertEqual(route_of("src/pages/index.tsx"), "/")
        self.assertEqual(route_of("src/pages/api/x.ts"), "")

    def test_a_rest_slot_takes_the_rest_of_the_link(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n<a href=\"/docs/a/b\">",
                        "web/docs.tsx": "// codegraph: page docs at /docs/[...slug]\n"})
        self.assertIn(("page:home", "page:docs", "leads"), r.wires)

    def test_a_link_short_of_a_slot_lands_on_no_page(self):
        r = self.pages({"web/home.tsx": "// codegraph: start page home at /\n<a href=\"/members\">",
                        "web/member.tsx": "// codegraph: page member at /members/[id]\n"})
        self.assertNotIn(("page:home", "page:member", "leads"), r.wires)
        self.assertTrue(self.has(r.unknown, "links to /members", "no page"))


class Fakes(Project):
    """A test fakes only what is outside the program, never its own code."""

    def setUp(self):
        super().setUp()
        tree(self.root, {"bars/__init__.py": mod("bars", "fetch"),
                         "bars/feed.py": mod("bars") + "import httpx\ndef fetch(): pass\n"})

    def test_faking_the_repos_own_function(self):
        r = self.check({"tests/test_feed.py": "# codegraph: test module bars\n"
                                              "patch('bars.feed.fetch')\n"})
        self.assertTrue(self.has(r.mismatches, "fakes bars.feed.fetch"))

    def test_faking_what_a_file_takes_from_outside_is_fine(self):
        r = self.check({"tests/test_feed.py": "# codegraph: test module bars\n"
                                              "patch('bars.feed.httpx')\n"})
        self.assertEqual(r.mismatches, [])


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptUses(unittest.TestCase):
    """Which names a TypeScript file takes from another, for front doors."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        tree(self.root, {"core/book.ts": ("// codegraph: module core\n// codegraph: front door Book\n"
                                          "export class Book {}\nexport function fill() {}\n")})

    def check(self, source: str):
        tree(self.root, {"app/main.ts": "// codegraph: module app\n// codegraph: front door\n" + source})
        return check(self.root)

    def test_a_named_import_on_the_door_passes(self):
        self.assertEqual(self.check('import { Book } from "../core/book";\n').mismatches, [])

    def test_a_named_import_off_the_door_is_a_mismatch(self):
        r = self.check('import { Book, fill as f } from "../core/book";\n')
        self.assertEqual([("fill" in m.text, m.line) for m in r.mismatches], [(True, 3)])

    def test_a_namespace_import_is_read_by_what_it_touches(self):
        r = self.check('import * as book from "../core/book";\nnew book.Book();\nbook.fill();\n')
        self.assertEqual([m.line for m in r.mismatches], [5])

    def test_a_namespace_handed_around_whole_cannot_be_told(self):
        r = self.check('import * as book from "../core/book";\nkeep(book);\n')
        self.assertEqual((r.mismatches, [u.line for u in r.unknown]), ([], [4]))

    def test_a_default_import_uses_default(self):
        r = self.check('import Book from "../core/book";\n')
        self.assertTrue(any("default" in m.text for m in r.mismatches))

    def test_faking_the_repos_own_file(self):
        tree(self.root, {"core/book.test.ts": "// codegraph: test module core\nvi.mock('./book');\n"})
        self.assertTrue(any("fakes ./book" in m.text for m in check(self.root).mismatches))
