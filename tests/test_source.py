# codegraph: test module source
"""Turning a path and an import statement into the name of another file,
and finding what a file reaches outside the program. Every test writes a
small repo and reads it through the front door: files_in and reader_of."""
from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from modules.drawing import build
from modules.source import files_in, reader_of
from tests.helpers import Folder, HAS_SCRIPT, mod, tree


class Repo(Folder):
    """A small repo, and what the source module reads from it."""

    def file(self, rel: str):
        return next(f for f in files_in(self.root) if f.rel == rel)

    def links(self, rel: str) -> list:
        f = self.file(rel)
        return reader_of(f).links(f, {g.name: g for g in files_in(self.root)})

    def landed(self, rel: str) -> list:
        return sorted(l.target for l in self.links(rel) if l.target)

    def conns(self, src: str) -> dict:
        tree(self.root, {"m.py": src})
        f = self.file("m.py")
        return {c.target: c for c in reader_of(f).outside(f)}

    def kinds(self, src: str) -> set:
        return {c.kind for c in self.conns(src).values()}


class FileNames(Repo):
    def name_of(self, rel: str):
        tree(self.root, {rel: ""})
        return self.file(rel)

    def test_nested_file(self):
        m = self.name_of("pkg/sub/thing.py")
        self.assertEqual(m.name, "pkg.sub.thing")
        self.assertEqual(m.package, "pkg.sub")
        self.assertEqual(m.group, "pkg/sub")

    def test_init_is_the_package(self):
        m = self.name_of("pkg/sub/__init__.py")
        self.assertEqual(m.name, "pkg.sub")
        self.assertEqual(m.package, "pkg.sub")

    def test_file_at_the_root(self):
        m = self.name_of("setup.py")
        self.assertEqual(m.name, "setup")
        self.assertEqual(m.package, "")
        self.assertEqual(m.group, ".")

    def test_lines_are_counted(self):
        tree(self.root, {"a.py": "x = 1\ny = 2\n"})
        self.assertEqual(self.file("a.py").lines, 2)


class RelativeImports(Repo):
    """`from ..x import y` written inside pkg.sub.thing."""

    def setUp(self):
        super().setUp()
        tree(self.root, {"pkg/__init__.py": "", "pkg/other.py": "", "pkg/sub/__init__.py": "",
                         "pkg/sub/near.py": "", "other/mod.py": ""})

    def landed_from(self, line: str) -> list:
        tree(self.root, {"pkg/sub/thing.py": line + "\n"})
        return self.landed("pkg/sub/thing.py")

    def test_absolute_is_left_alone(self):
        self.assertEqual(self.landed_from("import other.mod"), ["other.mod"])

    def test_one_dot_is_the_package(self):
        self.assertEqual(self.landed_from("from .near import y"), ["pkg.sub.near"])

    def test_bare_one_dot(self):
        self.assertEqual(self.landed_from("from . import y"), ["pkg.sub"])

    def test_two_dots_climb(self):
        self.assertEqual(self.landed_from("from ..other import y"), ["pkg.other"])

    def test_climbing_past_the_root_does_not_crash(self):
        self.assertEqual(self.landed_from("from .........x import y"), [])


class Resolution(Repo):
    def setUp(self):
        super().setUp()
        tree(self.root, {"pkg/__init__.py": "", "pkg/models.py": "class Bar: pass\n",
                         "pkg/engine/__init__.py": "", "pkg/engine/tick.py": "",
                         "scripts/helpers.py": ""})

    def landed_from(self, line: str, rel: str = "app.py") -> list:
        tree(self.root, {rel: line + "\n"})
        return self.landed(rel)

    def test_plain_module(self):
        self.assertEqual(self.landed_from("import pkg.models"), ["pkg.models"])

    def test_names_that_are_modules_each_count(self):
        self.assertEqual(self.landed_from("from pkg.engine import tick, Book"),
                         ["pkg.engine", "pkg.engine.tick"])

    def test_a_name_that_is_a_class_does_not(self):
        self.assertEqual(self.landed_from("from pkg.models import Bar"), ["pkg.models"])

    def test_third_party_misses(self):
        self.assertEqual(self.landed_from("from httpx import Client"), [])
        self.assertEqual([l.package for l in self.links("app.py")], ["httpx"])

    def test_sibling_script_resolves_through_its_folder(self):
        # scripts/run.py saying `import helpers` means the file next door
        self.assertEqual(self.landed_from("import helpers", "scripts/run.py"),
                         ["scripts.helpers"])


class Symbols(Repo):
    """Following a file's own imports, so a probe matches however it was written."""

    def test_plain_import(self):
        self.assertEqual(self.kinds("import httpx\nhttpx.Client()\n"), {"http"})

    def test_dotted_import_binds_the_root(self):
        self.assertEqual(self.kinds("import urllib.request\nurllib.request.urlopen(u)\n"),
                         {"http"})

    def test_alias(self):
        self.assertEqual(self.kinds("import requests as r\nr.post(u)\n"), {"http"})

    def test_from_import_keeps_the_whole_path(self):
        self.assertEqual(self.kinds("from alpaca.trading.client import TradingClient\n"
                                    "TradingClient()\n"), {"market"})

    def test_relative_import_is_not_a_library(self):
        self.assertEqual(self.conns("from .requests import post\npost()\n"), {})

    def test_the_same_call_written_two_ways(self):
        a = self.conns("from httpx import Client\nClient()\n")
        b = self.conns("import httpx\nhttpx.Client()\n")
        self.assertEqual(a, b)
        self.assertTrue(a)


class Probes(Repo):
    def test_sqlite(self):
        self.assertEqual(self.kinds("import sqlite3\nsqlite3.connect('a.db')\n"), {"database"})

    def test_http_clients(self):
        self.assertEqual(self.kinds("import httpx\nhttpx.Client()\n"), {"http"})
        self.assertEqual(self.kinds("import requests\nrequests.post(u)\n"), {"http"})

    def test_a_wildcard_matches_the_family(self):
        self.assertEqual(self.kinds("from alpaca.data.historical import "
                                    "CryptoHistoricalDataClient\nCryptoHistoricalDataClient()\n"),
                         {"market"})

    def test_ordinary_calls_are_not_connections(self):
        self.assertEqual(self.conns("import json\njson.dumps(1)\nself.book.apply()\n"), {})


class Outside(Repo):

    def test_a_url_becomes_its_host(self):
        c = self.conns('URL = "https://api.example.com/v1/go"')["net:api.example.com"]
        self.assertEqual(c.kind, "http")
        self.assertEqual(c.detail, "https /v1/go")

    def test_the_port_stays_with_the_host(self):
        self.assertIn("net:127.0.0.1:8787", self.conns('u = "http://127.0.0.1:8787"'))

    def test_a_database_url_is_a_database(self):
        c = self.conns('DSN = "postgresql://db.example.com/app"')["net:db.example.com"]
        self.assertEqual(c.kind, "database")

    def test_the_library_decides_what_a_url_is_for(self):
        # feedparser means these are feeds, whatever the scheme says
        got = self.conns(
            "import feedparser\n"
            'FEEDS = ["https://news.example.com/rss"]\n'
            "def pull():\n"
            "    return [feedparser.parse(f) for f in FEEDS]\n"
        )
        self.assertEqual(got["net:news.example.com"].kind, "feed")
        self.assertNotIn("svc:feedparser", got)   # folded into the host

    def test_a_named_service_needs_no_url(self):
        c = self.conns("import sqlite3\nc = sqlite3.connect('a.db')")["svc:sqlite"]
        self.assertEqual(c.kind, "database")

    def test_a_client_with_no_url_names_the_library(self):
        c = self.conns("import httpx\nc = httpx.Client(base_url=cfg.url)")["svc:httpx"]
        self.assertEqual(c.kind, "http")
        self.assertIn("not in the source", c.detail)

    def test_a_server_does_not_claim_a_missing_destination(self):
        c = self.conns("from fastapi import FastAPI\napp = FastAPI()")["svc:fastapi"]
        self.assertEqual(c.kind, "serves")
        self.assertNotIn("not in the source", c.detail)

    def test_environment_by_call_and_by_subscript(self):
        self.assertIn("env:environment", self.conns("import os\nk = os.getenv('K')"))
        self.assertIn("env:environment", self.conns("import os\nk = os.environ['K']"))

    def test_a_file_that_touches_nothing_outside(self):
        self.assertEqual(self.conns("def add(a, b):\n    return a + b\n"), {})

    def test_an_xml_namespace_is_not_a_connection(self):
        self.assertEqual(self.conns('NS = "http://www.w3.org/2000/svg"'), {})

    def test_prose_is_not_a_url(self):
        self.assertEqual(self.conns('"""See the docs. Ratio is 3:1."""'), {})

    def test_a_pattern_that_looks_like_a_url_is_not_one(self):
        # A regex for gs:// addresses, which is what the Firebase SDK ships.
        # urlsplit reads the bracket as the start of an IPv6 host and raises;
        # one of these anywhere used to take the whole map down with it.
        self.assertEqual(self.conns(r'GS = r"gs://([A-Za-z0-9.\-_]+)(/(.*))?$"'), {})

    def test_an_unreadable_address_leaves_the_rest_of_the_file_alone(self):
        # The point is that the bad one is dropped, not that it stops the read.
        got = self.conns('BAD = "gs://([A-Za-z0-9.-_]+)"\n'
                         'GOOD = "https://api.example.com/v1"\n')
        self.assertIn("net:api.example.com", got)


SMALL_APP = {"app.py": "x = 1\n", "public/bundle.py": "y = 2\n"}


class WhatIsNotSource(Repo):
    """Build output is not the program, and git already knows which it is."""

    def git_repo(self, files: dict, ignore: str):
        tree(self.root, files)
        (self.root / ".gitignore").write_text(ignore, encoding="utf-8")
        for args in (["init", "-q"], ["add", "-A"]):
            if subprocess.run(["git", "-C", str(self.root)] + args,
                              capture_output=True).returncode:
                self.skipTest("git is not available")
        return sorted(f.rel for f in files_in(self.root))

    def test_an_ignored_folder_is_not_walked(self):
        # The case this came from: a Vite build lands in public/ because that is
        # what Firebase Hosting serves, so a minified copy of the whole app sat
        # beside the app and got read as source.
        rels = self.git_repo(SMALL_APP, "public/\n")
        self.assertEqual(rels, ["app.py"])

    def test_the_designs_folder_at_the_root_is_not_code(self):
        # Claude Design exports land in designs/, scripts and all; a folder of
        # that name deeper in the program is the program's own
        tree(self.root, {"app.py": "x = 1\n", "designs/home/app.js": "render()\n",
                         "src/designs/button.py": "y = 2\n"})
        self.assertEqual(sorted(f.rel for f in files_in(self.root)), ["app.py", "src/designs/button.py"])

    def test_a_folder_set_up_for_codegraph_on_its_own_is_read_on_its_own(self):
        # an app kept inside the repo to try codegraph on carries tags of its
        # own; read as part of the repo around it, they would claim its modules
        block = "# Rules\n<!-- codegraph:start -->\n...\n<!-- codegraph:end -->\n"
        tree(self.root, {"app.py": "x = 1\n", "tests/example/CLAUDE.md": block,
                         "tests/example/server.py": "y = 2\n", "tests/test_app.py": "z = 3\n",
                         "docs/CLAUDE.md": "No block here.\n", "docs/build.py": "w = 4\n"})
        self.assertEqual(sorted(f.rel for f in files_in(self.root)),
                         ["app.py", "docs/build.py", "tests/test_app.py"])
        self.assertEqual([f.rel for f in files_in(self.root / "tests" / "example")], ["server.py"])

    def test_a_generated_file_that_was_committed_stays(self):
        # Checked in is checked in: it ships, so it is part of the program
        # whoever wrote it.
        rels = self.git_repo({"app.py": "x = 1\n", "built.py": "y = 2\n"}, "nothing/\n")
        self.assertEqual(rels, ["app.py", "built.py"])

    def test_a_folder_that_is_not_a_repo_is_read_whole(self):
        tree(self.root, SMALL_APP)
        self.assertEqual(sorted(f.rel for f in files_in(self.root)),
                         ["app.py", "public/bundle.py"])

    def test_a_file_written_since_the_last_read_is_picked_up(self):
        # --serve reads the repo again on every refresh, and a file written
        # while it runs is one git has not been told about yet. Remembering
        # the first answer would keep that file off the map until a restart.
        self.assertEqual(self.git_repo(SMALL_APP, "public/\n"), ["app.py"])
        tree(self.root, {"later.py": "z = 3\n"})
        self.assertEqual(sorted(f.rel for f in files_in(self.root)),
                         ["app.py", "later.py"])


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptImports(unittest.TestCase):
    """TypeScript and JavaScript: which file an import lands on. Parsing is
    tree-sitter's job; resolving is ours, and it is where the bugs live."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def graph(self, files: dict, **kw):
        tree(self.root, files)
        return build(self.root, **kw)

    def edges(self, g) -> set:
        return {(e["from"], e["to"]) for e in g["edges"] if e["kind"] in ("import", "lazy")}

    def test_a_relative_import_finds_the_ts_file(self):
        g = self.graph({"src/a.ts": 'import { b } from "./b";\n',
                        "src/b.ts": "export const b = 1;\n"})
        self.assertIn(("src/a.ts", "src/b.ts"), self.edges(g))

    def test_a_folder_import_finds_its_index(self):
        g = self.graph({"src/a.ts": 'import { x } from "./lib";\n',
                        "src/lib/index.ts": "export const x = 1;\n"})
        self.assertIn(("src/a.ts", "src/lib/index.ts"), self.edges(g))

    def test_a_js_ending_finds_the_ts_file(self):
        # ES modules write the .js the compiler will emit, not the .ts on disk
        g = self.graph({"src/a.ts": 'import { b } from "./b.js";\n',
                        "src/b.ts": "export const b = 1;\n"})
        self.assertIn(("src/a.ts", "src/b.ts"), self.edges(g))

    def test_a_tsconfig_shortcut(self):
        g = self.graph({
            "tsconfig.json": (
                '{\n  // comments and a trailing comma, as tsconfig allows\n'
                '  "compilerOptions": {\n    "baseUrl": ".",\n'
                '    "paths": {\n      "@app/core": ["packages/core/src/index.ts"],\n'
                '      "@/*": ["src/*"],\n    },\n  },\n}\n'),
            "packages/core/src/index.ts": "export const core = 1;\n",
            "src/util/time.ts": "export const now = 1;\n",
            "src/main.ts": 'import { core } from "@app/core";\nimport { now } from "@/util/time";\n',
        })
        self.assertIn(("src/main.ts", "packages/core/src/index.ts"), self.edges(g))
        self.assertIn(("src/main.ts", "src/util/time.ts"), self.edges(g))

    def test_a_workspace_package_by_its_name(self):
        g = self.graph({
            "packages/core/package.json": '{"name": "@acme/core", "main": "src/index.ts"}',
            "packages/core/src/index.ts": "export const core = 1;\n",
            "packages/app/src/main.ts": 'import { core } from "@acme/core";\n',
        })
        self.assertIn(("packages/app/src/main.ts", "packages/core/src/index.ts"), self.edges(g))

    def test_node_built_ins_are_ignored(self):
        g = self.graph({"a.ts": 'import * as os from "node:os";\nimport fs from "fs";\n'})
        self.assertEqual((self.edges(g), g["externals_seen"]), (set(), {}))

    def test_a_package_is_counted_by_its_whole_name(self):
        g = self.graph({"a.ts": 'import { X } from "@scope/pkg/sub/types.js";\nimport lodash from "lodash";\n'})
        self.assertEqual(sorted(g["externals_seen"]), ["@scope/pkg", "lodash"])

    def test_require_export_from_and_dynamic_import(self):
        g = self.graph({
            "a.js": 'const b = require("./b");\nexport * from "./c";\n'
                    'async function later() { return import("./d"); }\n',
            "b.js": "", "c.js": "", "d.js": "",
        })
        kinds = {e["to"]: e["kind"] for e in g["edges"] if e["from"] == "a.js"}
        self.assertEqual(kinds, {"b.js": "import", "c.js": "import", "d.js": "lazy"})

    def test_declaration_files_are_left_out(self):
        g = self.graph({"a.ts": "export const a = 1;\n", "types.d.ts": "declare const x: number;\n"})
        self.assertEqual([n["id"] for n in g["nodes"]], ["a.ts"])

    def test_python_and_typescript_in_one_codebase(self):
        g = self.graph({"api/app.py": "", "web/main.ts": 'import { a } from "./a";\n',
                        "web/a.ts": "export const a = 1;\n"})
        self.assertEqual({n["id"] for n in g["nodes"]}, {"api.app", "web/main.ts", "web/a.ts"})


@unittest.skipUnless(HAS_SCRIPT, "tree-sitter is not installed")
class ScriptOutside(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def conns(self, source: str, name: str = "a.ts") -> dict:
        tree(self.root, {name: source})
        f = files_in(self.root)[0]
        return {c.target: c.kind for c in reader_of(f).outside(f)}

    def test_a_fetched_url_becomes_its_host(self):
        self.assertEqual(self.conns('await fetch("https://api.example.com/v1/x");\n'),
                         {"net:api.example.com": "http"})

    def test_the_environment(self):
        self.assertEqual(self.conns("const key = process.env.API_KEY;\n"),
                         {"env:environment": "env"})

    def test_a_library_found_through_its_import(self):
        found = self.conns('import { spawn } from "node:child_process";\nspawn("git");\n'
                           'import Anthropic from "@anthropic-ai/sdk";\nnew Anthropic();\n')
        self.assertEqual(found, {"svc:child_process": "process", "svc:anthropic": "http"})

    def test_a_plain_file_reaches_nothing(self):
        self.assertEqual(self.conns("export const add = (a: number, b: number) => a + b;\n"), {})

    def test_a_port_filled_in_later_leaves_the_host(self):
        self.assertEqual(self.conns("const u = `http://127.0.0.1:${port}/x`;\n"),
                         {"net:127.0.0.1": "http"})

    def test_an_app_link_is_not_a_web_call(self):
        self.assertEqual(self.conns('open("obsidian://open?vault=x");\n'), {})

    def test_a_link_or_an_image_on_a_page_is_not_a_call(self):
        # the browser follows these when a person clicks or the page draws;
        # the code itself never reaches the host
        page = ('export default function Home() {\n'
                '  return <a href="https://remix.run"><img src="https://cdn.example.com/a.svg" /></a>;\n'
                '}\n')
        self.assertEqual(self.conns(page, "home.tsx"), {})

    def test_a_link_kept_in_a_list_for_a_page_is_not_a_call(self):
        logos = 'const logos = [{ src: "https://cdn.example.com/a.svg", href: "https://fly.io" }];\n'
        self.assertEqual(self.conns(logos), {})

    def test_a_url_fetched_beside_a_link_still_counts(self):
        page = ('const data = await fetch("https://api.example.com/x");\n'
                'export const Home = () => <a href="https://remix.run">Remix</a>;\n')
        self.assertEqual(self.conns(page, "home.tsx"), {"net:api.example.com": "http"})
