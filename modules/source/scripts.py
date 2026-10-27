# codegraph: module source
from __future__ import annotations

import json
import re

from .files import Act, File, Link, SKIP_DIRS, Use, _count_lines
from .outside import connections, urls_from


# ---------------------------------------------------- TypeScript, JavaScript
#
# tree-sitter does the parsing (docs/adr/0001). What an import lands on is
# ours: relative paths with or without an ending, a folder's index file, a
# .js ending standing for the .ts on disk, tsconfig "paths" shortcuts, and
# packages in the same repository named in their package.json.

NODE_BUILTINS = frozenset("""
    assert async_hooks buffer child_process cluster console constants crypto dgram
    diagnostics_channel dns domain events fs fs/promises http http2 https inspector
    module net os path path/posix path/win32 perf_hooks process punycode querystring
    readline repl stream stream/promises string_decoder sys timers timers/promises
    tls trace_events tty url util v8 vm wasi worker_threads zlib test
""".split())

SCRIPT_ENDINGS = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
# an import written with the ending the compiler will emit stands for these
EMITTED_AS = {".js": (".ts", ".tsx"), ".jsx": (".tsx",), ".mjs": (".mts",), ".cjs": (".cts",)}

SCRIPT_PROBES = (
    ("fetch",                         "http", None),
    ("axios",                         "http", None),
    ("axios.*",                       "http", None),
    ("node-fetch",                    "http", None),
    ("got",                           "http", None),
    ("got.*",                         "http", None),
    ("http.request", "http", None), ("http.get", "http", None),
    ("https.request", "http", None), ("https.get", "http", None),
    ("@anthropic-ai/sdk*",            "http", "anthropic"),
    ("openai*",                       "http", "openai"),

    ("http.createServer",             "serves", None),
    ("https.createServer",            "serves", None),
    ("express",                       "serves", None),
    ("fastify",                       "serves", None),
    ("hono*",                         "serves", None),

    ("firebase-admin*",               "database", "firestore"),
    ("firebase/firestore*",           "database", "firestore"),
    ("pg.*",                          "database", "postgres"),
    ("postgres",                      "database", "postgres"),
    ("mysql2*",                       "database", "mysql"),
    ("mongodb.*",                     "database", "mongodb"),
    ("mongoose.*",                    "database", "mongodb"),
    ("redis.*",                       "database", "redis"),
    ("ioredis",                       "database", "redis"),
    ("better-sqlite3",                "database", "sqlite"),
    ("sqlite3.*",                     "database", "sqlite"),
    ("@prisma/client*",               "database", None),

    ("@aws-sdk/*",                    "cloud", "aws"),
    ("@google-cloud/*",               "cloud", "google cloud"),

    ("child_process.*",               "process", None),
    ("execa*",                        "process", None),
)


def loose_json(text: str):
    """Parse JSON the way tsconfig writes it: comments and trailing commas."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':                                  # copy a string whole
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(text[i:j + 1]); i = j + 1
        elif text.startswith("//", i):
            i = text.find("\n", i) if "\n" in text[i:] else n
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c); i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


FUNCTIONS = ("function_declaration", "function_expression", "function", "arrow_function",
             "method_definition", "generator_function_declaration")
# What a person does that runs code: `handleSave`, `onPick`, or a function
# handed to an element as `onClick={...}` or to addEventListener.
HANDLER_NAMES = re.compile(r"^(on|handle)[A-Z]\w*$")


def handler_uses(root, bound: dict, whole: dict, text) -> list:
    """(spec, name, line, by) for every imported name used by code that runs
    when a person acts, following the file's own functions those call."""
    local: dict = {}                # a function's name -> its node

    def fn_of(node):
        """The function a value is: itself, or the one useCallback wraps."""
        if node is None:
            return None
        if node.type in FUNCTIONS:
            return node
        if node.type == "call_expression":
            fn = node.child_by_field_name("function")
            args = node.child_by_field_name("arguments")
            first = next((a for a in args.children if a.is_named), None) if args else None
            if fn is not None and text(fn) in ("useCallback", "React.useCallback"):
                return fn_of(first)
        return None

    roots: list = []                # (node, by)

    def gather(node):
        t = node.type
        if t in ("function_declaration", "generator_function_declaration", "method_definition"):
            name = node.child_by_field_name("name")
            if name is not None:
                local[text(name)] = node
        elif t in ("variable_declarator", "public_field_definition", "field_definition"):
            name = node.child_by_field_name("name") or node.child_by_field_name("property")
            fn = fn_of(node.child_by_field_name("value"))
            if name is not None and fn is not None:
                local[text(name)] = fn
        elif t == "jsx_attribute":
            name = next((c for c in node.children if c.type == "property_identifier"), None)
            value = next((c for c in node.children if c.type == "jsx_expression"), None)
            if name is not None and value is not None and HANDLER_NAMES.match(text(name)):
                roots.append((value, text(name)))
        elif t == "call_expression":
            fn = node.child_by_field_name("function")
            args = node.child_by_field_name("arguments")
            if fn is not None and text(fn).endswith("addEventListener") and args is not None:
                named = [a for a in args.children if a.is_named]
                if len(named) > 1:
                    roots.append((named[1], "addEventListener"))
        for c in node.children:
            gather(c)

    gather(root)
    roots += [(node, name) for name, node in local.items() if HANDLER_NAMES.match(name)]

    out: list = []

    def follow(node, by: str, seen: set):
        t = node.type
        if t == "identifier":
            name = text(node)
            parent = node.parent
            if name in bound:
                spec, member = bound[name]
                out.append((spec, member, node.start_point[0] + 1, by))
            elif name in whole and parent is not None and parent.type == "member_expression"                     and parent.child_by_field_name("object") == node:
                prop = parent.child_by_field_name("property")
                out.append((whole[name], text(prop), node.start_point[0] + 1, by))
            elif name in local and name not in seen:
                seen.add(name)
                follow(local[name], by, seen)
            return
        for c in node.children:
            follow(c, by, seen)

    for node, by in roots:
        follow(node, by, {by})
    return out


def package_name(spec: str) -> str:
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


class ScriptReader:
    """TypeScript and JavaScript, read with tree-sitter."""
    lang = "script"
    suffixes = SCRIPT_ENDINGS

    def __init__(self):
        import tree_sitter as ts
        import tree_sitter_javascript as tsj
        import tree_sitter_typescript as tst
        typescript = ts.Language(tst.language_typescript())
        tsx = ts.Language(tst.language_tsx())
        javascript = ts.Language(tsj.language())
        self.parsers = {s: ts.Parser(lang) for s, lang in (
            (".ts", typescript), (".mts", typescript), (".cts", typescript),
            (".tsx", tsx), (".js", javascript), (".jsx", javascript),
            (".mjs", javascript), (".cjs", javascript))}
        self._facts: dict = {}
        self._configs: dict = {}
        self._workspaces: dict = {}

    def file_of(self, path: Path, root: Path) -> File:
        rel = path.relative_to(root).as_posix()
        folder = rel.rsplit("/", 1)[0] if "/" in rel else ""
        return File(name=rel, path=path, rel=rel, group=folder or ".", package=folder,
                    lines=_count_lines(path), lang=self.lang)

    # -------------------------------------------------------------- reading
    def facts(self, f: File) -> dict:
        """Everything this reader needs from one file, read once."""
        if f.path in self._facts:
            return self._facts[f.path]
        try:
            src = f.path.read_bytes()
        except OSError:
            src = b""
        tree = self.parsers[f.path.suffix].parse(src)
        facts = {"imports": [], "uses": [], "calls": [], "strings": [], "env": False}
        bound: dict = {}           # local name -> (spec, name or None for the whole)
        whole: dict = {}           # local name -> spec, for a module bound whole
        text = lambda n: n.text.decode("utf-8", "replace")

        def spec_of(node) -> str | None:
            if node is None or node.type != "string":
                return None
            frag = [c for c in node.children if c.type == "string_fragment"]
            return text(frag[0]) if frag else ""

        def dotted(node) -> str:
            parts = []
            while node is not None and node.type == "member_expression":
                parts.append(text(node.child_by_field_name("property")))
                node = node.child_by_field_name("object")
            if node is None or node.type not in ("identifier", "this"):
                return ""
            parts.append(text(node))
            return ".".join(reversed(parts))

        def imported(stmt, spec, nested):
            facts["imports"].append((spec, nested))
            clause = next((c for c in stmt.children if c.type == "import_clause"), None)
            for c in clause.children if clause else []:
                if c.type == "identifier":                    # import X from
                    bound[text(c)] = (spec, "default")
                    facts["uses"].append((spec, "default", c.start_point[0] + 1))
                elif c.type == "namespace_import":            # import * as X
                    name = next(x for x in c.children if x.type == "identifier")
                    whole[text(name)] = spec
                elif c.type == "named_imports":               # import { a, b as c }
                    for s in c.children:
                        if s.type != "import_specifier":
                            continue
                        name = text(s.child_by_field_name("name"))
                        alias = s.child_by_field_name("alias")
                        bound[text(alias) if alias else name] = (spec, name)
                        facts["uses"].append((spec, name, s.start_point[0] + 1))

        def walk(node, nested):
            t = node.type
            if t == "import_statement":
                spec = spec_of(node.child_by_field_name("source"))
                if spec is not None:
                    imported(node, spec, nested)
                return
            if t == "export_statement":
                spec = spec_of(node.child_by_field_name("source"))
                if spec is not None:                          # export ... from
                    facts["imports"].append((spec, nested))
                    for c in node.children:
                        if c.type == "export_clause":
                            for s in c.children:
                                if s.type == "export_specifier":
                                    facts["uses"].append((spec, text(s.child_by_field_name("name")),
                                                          s.start_point[0] + 1))
                    return
            if t in ("call_expression", "new_expression"):
                fn = node.child_by_field_name("function" if t == "call_expression" else "constructor")
                args = node.child_by_field_name("arguments")
                first = next((a for a in args.children if a.is_named), None) if args else None
                if fn is not None and fn.type == "import":            # import("./x")
                    spec = spec_of(first)
                    if spec is not None:
                        facts["imports"].append((spec, True))
                elif fn is not None and fn.type == "identifier" and text(fn) == "require":
                    spec = spec_of(first)
                    if spec is not None:
                        facts["imports"].append((spec, nested))
                        holder = node.parent
                        if holder is not None and holder.type == "variable_declarator":
                            name = holder.child_by_field_name("name")
                            if name is not None and name.type == "identifier":
                                whole[text(name)] = spec
                            elif name is not None and name.type == "object_pattern":
                                for p in name.children:
                                    key = p.child_by_field_name("key") if p.type == "pair_pattern" else p
                                    if key is not None and key.type in (
                                            "shorthand_property_identifier_pattern",
                                            "property_identifier"):
                                        facts["uses"].append((spec, text(key), p.start_point[0] + 1))
                elif fn is not None:
                    facts["calls"].append(dotted(fn))
            if t == "member_expression":
                name = dotted(node)
                if name.startswith("process.env"):
                    facts["env"] = True
                head = name.split(".")[0]
                if head in whole and (node.parent is None or node.parent.type != "member_expression"
                                      or node.parent.child_by_field_name("object") != node):
                    rest = name.split(".")[1:]
                    facts["uses"].append((whole[head], rest[0] if rest else None,
                                          node.start_point[0] + 1))
            if t == "identifier" and text(node) in whole and node.parent is not None and not (
                    node.parent.type == "member_expression"
                    and node.parent.child_by_field_name("object") == node) and \
                    node.parent.type not in ("namespace_import", "variable_declarator"):
                facts["uses"].append((whole[text(node)], None, node.start_point[0] + 1))
            if t in ("string_fragment",):
                facts["strings"].append(text(node))
            deeper = nested or t in ("function_declaration", "function_expression", "arrow_function",
                                     "method_definition", "generator_function_declaration")
            for c in node.children:
                walk(c, deeper)

        walk(tree.root_node, False)
        facts["acts"] = handler_uses(tree.root_node, bound, whole, text)
        # a call written through an import means the library: spawn() is
        # child_process.spawn, new Anthropic() is @anthropic-ai/sdk
        def through(name: str) -> str:
            head, _, tail = name.partition(".")
            if head in whole:
                lib = whole[head]
            elif head in bound:
                spec, member = bound[head]
                lib = spec if member == "default" else spec + "." + member
            else:
                return name
            lib = lib[5:] if lib.startswith("node:") else lib
            return lib + ("." + tail if tail else "")
        facts["calls"] = [through(c) for c in facts["calls"] if c]
        self._facts[f.path] = facts
        return facts

    # ------------------------------------------------------------ resolving
    def root_of(self, f: File) -> Path:
        return f.path.parents[f.rel.count("/")]

    def config_for(self, f: File, root: Path) -> list:
        """The tsconfig "paths" in force for this file: (pattern, targets,
        base folder) from the nearest tsconfig.json, following "extends"."""
        here = f.path.parent
        while True:
            if here in self._configs:
                return self._configs[here]
            cfg = here / "tsconfig.json"
            if cfg.is_file():
                self._configs[here] = self.read_config(cfg, root, set())
                return self._configs[here]
            if here == root or here.parent == here:
                return []
            here = here.parent

    def read_config(self, cfg: Path, root: Path, seen: set) -> list:
        if cfg in seen:
            return []
        seen.add(cfg)
        try:
            data = loose_json(cfg.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        opts = data.get("compilerOptions", {}) or {}
        base = cfg.parent / opts.get("baseUrl", ".")
        rules = [(k, v, base) for k, v in (opts.get("paths") or {}).items()]
        if not rules and "baseUrl" in opts:
            rules = [("*", ["*"], base)]
        parent = data.get("extends")
        if isinstance(parent, str) and parent.startswith("."):
            more = cfg.parent / parent
            more = more if more.suffix == ".json" else more.with_suffix(".json")
            rules += self.read_config(more, root, seen)
        return rules

    def workspaces(self, root: Path) -> dict:
        """Packages in this repository, by the name in their package.json."""
        if root not in self._workspaces:
            found = {}
            for pj in root.rglob("package.json"):
                parts = pj.relative_to(root).parts[:-1]
                if any(p in SKIP_DIRS or p.startswith(".") for p in parts):
                    continue
                try:
                    data = json.loads(pj.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if isinstance(data.get("name"), str):
                    found[data["name"]] = (pj.parent, data)
            self._workspaces[root] = found
        return self._workspaces[root]

    def find(self, path: Path, root: Path, index: dict) -> str | None:
        """The file in the index this path stands for, trying the endings
        and index files an import may leave out."""
        try:
            rel = path.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            return None                                  # outside the codebase
        tries = [rel]
        stem, dot, end = rel.rpartition(".")
        if dot and "." + end in EMITTED_AS:
            tries += [stem + e for e in EMITTED_AS["." + end]]
        tries += [rel + e for e in SCRIPT_ENDINGS]
        tries += [rel + "/index" + e for e in SCRIPT_ENDINGS]
        return next((t for t in tries if t in index), None)

    def land(self, spec: str, f: File, index: dict):
        """Where an import lands: ("file", name), ("package", name) or None
        for Node's own modules and anything that cannot be placed."""
        root = self.root_of(f)
        if spec.startswith("node:") or spec in NODE_BUILTINS:
            return None
        if spec.startswith("."):
            hit = self.find(f.path.parent / spec, root, index)
            return ("file", hit) if hit else None
        for pattern, targets, base in self.config_for(f, root):
            head, star, tail = pattern.partition("*")
            if star and spec.startswith(head) and spec.endswith(tail) and \
                    len(spec) >= len(head) + len(tail):
                middle = spec[len(head):len(spec) - len(tail)]
            elif not star and spec == pattern:
                middle = ""
            else:
                continue
            for t in targets if isinstance(targets, list) else [targets]:
                hit = self.find(base / t.replace("*", middle), root, index)
                if hit:
                    return ("file", hit)
        name = package_name(spec)
        local = self.workspaces(root).get(name)
        if local:
            folder, data = local
            sub = spec[len(name):].lstrip("/")
            entries = [sub] if sub else [data.get(k) for k in ("source", "types", "module", "main")
                                         if isinstance(data.get(k), str)] + ["src/index", "index"]
            for entry in entries:
                hit = self.find(folder / entry, root, index)
                if hit:
                    return ("file", hit)
        return ("package", name)

    # --------------------------------------------------------- the interface
    def links(self, f: File, index: dict) -> list:
        out = []
        for spec, nested in self.facts(f)["imports"]:
            hit = self.land(spec, f, index)
            if hit:
                out.append(Link(hit[1], None, nested) if hit[0] == "file"
                           else Link(None, hit[1], nested))
        return out

    def uses(self, f: File, index: dict) -> list:
        out = []
        for spec, name, line in self.facts(f)["uses"]:
            hit = self.land(spec, f, index)
            if hit and hit[0] == "file":
                out.append(Use(hit[1], name, line) if name else
                           Use(hit[1], None, line, "a module passed whole"))
        return out

    def acts(self, f: File, index: dict) -> list:
        out = []
        for spec, name, line, by in self.facts(f)["acts"]:
            hit = self.land(spec, f, index)
            if hit and hit[0] == "file":
                out.append(Act(hit[1], name, line, by))
        return out

    def outside(self, f: File) -> list:
        facts = self.facts(f)
        return connections(facts["calls"], urls_from(facts["strings"]), facts["env"],
                           SCRIPT_PROBES)
