# codegraph: test module source
"""Turning a path and an import statement into the name of another file,
and finding what a file reaches outside the program."""
from __future__ import annotations

import ast
import json
import tempfile
import unittest
from pathlib import Path

from modules.drawing import build
from modules.source import files_in, reader_of
from modules.source.files import File, file_of
from modules.source.outside import match_probe, read_outside, symbol_table, through_imports
from modules.source.python import RawImport, absolute, resolve
from tests.helpers import HAS_SCRIPT, mod, tree


class FileNames(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def name_of(self, rel: str) -> File:
        tree(self.root, {rel: ""})
        return file_of(self.root / rel, self.root)

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
        self.assertEqual(file_of(self.root / "a.py", self.root).lines, 2)


class RelativeImports(unittest.TestCase):
    """`from ..x import y` written inside pkg.sub.thing."""

    def abs_of(self, module, level, package="pkg.sub"):
        imp = RawImport(module, (), level, False)
        return absolute(imp, package)

    def test_absolute_is_left_alone(self):
        self.assertEqual(self.abs_of("other.mod", 0), "other.mod")

    def test_one_dot_is_the_package(self):
        self.assertEqual(self.abs_of("thing", 1), "pkg.sub.thing")

    def test_bare_one_dot(self):
        self.assertEqual(self.abs_of(None, 1), "pkg.sub")

    def test_two_dots_climb(self):
        self.assertEqual(self.abs_of("other", 2), "pkg.other")

    def test_climbing_past_the_root_does_not_crash(self):
        self.assertEqual(self.abs_of("x", 9), "x")


class Resolution(unittest.TestCase):
    index = {"pkg": 1, "pkg.models": 1, "pkg.engine": 1, "pkg.engine.tick": 1,
             "scripts.helpers": 1}

    def test_plain_module(self):
        self.assertEqual(resolve("pkg.models", (), self.index), ["pkg.models"])

    def test_names_that_are_modules_each_count(self):
        hits = resolve("pkg.engine", ("tick", "Book"), self.index)
        self.assertEqual(sorted(hits), ["pkg.engine", "pkg.engine.tick"])

    def test_a_name_that_is_a_class_does_not(self):
        self.assertEqual(resolve("pkg.models", ("Bar",), self.index), ["pkg.models"])

    def test_third_party_misses(self):
        self.assertEqual(resolve("httpx", ("Client",), self.index), [])

    def test_sibling_script_resolves_through_its_folder(self):
        # scripts/run.py saying `import helpers` means the file next door
        self.assertEqual(
            resolve("helpers", (), self.index, package="scripts"),
            ["scripts.helpers"],
        )


class Symbols(unittest.TestCase):
    """Following a file's own imports, so a probe matches however it was written."""

    def syms(self, src):
        return symbol_table(ast.parse(src))

    def test_plain_import(self):
        self.assertEqual(self.syms("import httpx")["httpx"], "httpx")

    def test_dotted_import_binds_the_root(self):
        self.assertEqual(self.syms("import a.b.c")["a"], "a")

    def test_alias(self):
        self.assertEqual(self.syms("import numpy as np")["np"], "numpy")

    def test_from_import_keeps_the_whole_path(self):
        syms = self.syms("from alpaca.trading.client import TradingClient")
        self.assertEqual(syms["TradingClient"], "alpaca.trading.client.TradingClient")

    def test_relative_import_is_not_a_library(self):
        self.assertEqual(self.syms("from .models import Bar"), {})

    def test_the_same_call_written_two_ways(self):
        a = through_imports("Client", self.syms("from httpx import Client"))
        b = through_imports("httpx.Client", self.syms("import httpx"))
        self.assertEqual(a, b)
        self.assertEqual(match_probe(a), match_probe(b))


class Probes(unittest.TestCase):
    def kind(self, name):
        hit = match_probe(name)
        return hit[0] if hit else None

    def test_sqlite(self):
        self.assertEqual(self.kind("sqlite3.connect"), "database")

    def test_http_clients(self):
        self.assertEqual(self.kind("httpx.Client"), "http")
        self.assertEqual(self.kind("requests.post"), "http")

    def test_a_wildcard_matches_the_family(self):
        self.assertEqual(self.kind("alpaca.data.historical.CryptoHistoricalDataClient"),
                         "market")

    def test_ordinary_calls_are_not_connections(self):
        self.assertIsNone(self.kind("json.dumps"))
        self.assertIsNone(self.kind("self.book.apply"))


class Outside(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def conns(self, src):
        path = self.root / "m.py"
        path.write_text(src, encoding="utf-8")
        return {c.target: c for c in read_outside(path)}

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

    def test_prose_is_not_a_url(self):
        self.assertEqual(self.conns('"""See the docs. Ratio is 3:1."""'), {})


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

    def conns(self, source: str) -> dict:
        tree(self.root, {"a.ts": source})
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
