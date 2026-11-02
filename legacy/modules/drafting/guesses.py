# codegraph: module drafting
from __future__ import annotations

import re
from fnmatch import fnmatchcase

from modules.rules import route_of


DECLARATION = "codegraph.json"     # the old declaration, read once to seed a draft
TEST_NAMES = ("test_*.py", "*_test.py", "conftest.py", "*.test.*", "*.spec.*")
TEST_DIRS = ("tests", "test", "__tests__", "e2e", "playwright", "cypress")
GENERIC_FOLDERS = ("src", "lib", "source")
TOOLING_NAMES = ("*.config.*", "setup.py", "noxfile.py", "tasks.py", "manage.py",
                 "fabfile.py", "gulpfile.*", "Gruntfile.*", "webpack.*", "rollup.*")
TOOLING_DIRS = ("scripts", "tools", "bin", "migrations", "alembic")


def path_match(rel: str, pattern: str) -> bool:
    """Match a path a folder at a time: `*` stays inside one folder, `**`
    spans any number of them. `atp/*` is atp's own files, not atp/engine's."""
    def walk(parts: list, pats: list) -> bool:
        if not pats:
            return not parts
        if pats[0] == "**":
            return any(walk(parts[i:], pats[1:]) for i in range(len(parts) + 1))
        return bool(parts) and fnmatchcase(parts[0], pats[0]) and walk(parts[1:], pats[1:])
    return walk(rel.split("/"), pattern.split("/"))


def _any_match(rel: str, patterns: list) -> bool:
    return any(path_match(rel, p) for p in patterns)


# ------------------------------------------------------------------ drafting
#
# A first set of tags, made from what the code does today. Setup writes it
# into the files, then the agent running setup corrects it by judgment: the
# draft knows folders and imports, not what the program is for.

DESIGN_DIRS = ("ui", "design-system", "design", "theme", "tokens", "styles", "primitives")
COMPONENT_DIRS = ("components", "component", "widgets")
PAGE_DIRS = ("pages", "views", "screens", "routes")
UI_TEST_HINTS = ("@playwright/test", "cypress", "playwright", "selenium", "puppeteer")


def looks_like_test(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in TEST_DIRS for p in parts[:-1]) or \
        any(fnmatchcase(parts[-1], p) for p in TEST_NAMES)


def looks_like_tooling(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in TOOLING_DIRS for p in parts[:-1]) or \
        any(fnmatchcase(parts[-1], p) for p in TOOLING_NAMES)


def _slug(s: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", s)
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


def _ui_kind(f: File) -> tuple | None:
    """(kind, name) for a file that draws UI, else None."""
    parts = f.rel.split("/")
    folders, stem = parts[:-1], parts[-1].rsplit(".", 1)[0]
    if stem == "page" and "app" in folders or "pages" in folders and route_of(f.rel):
        route = route_of(f.rel)
        name = "home" if route == "/" else _slug(route.replace("[", "").replace("]", ""))
        return "page", name
    if f.lang != "script" or not f.rel.endswith((".tsx", ".jsx")):
        return None
    name = _slug(folders[-1] if stem == "index" and folders else stem)
    if any(p in DESIGN_DIRS for p in folders):
        return "design", ""
    if any(p in PAGE_DIRS for p in folders):
        return "page", name
    if stem in ("App", "app") and not any(p in COMPONENT_DIRS for p in folders):
        return "page", "app"
    return "component", name
