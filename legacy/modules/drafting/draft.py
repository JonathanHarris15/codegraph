# codegraph: module drafting
from __future__ import annotations

import json
from collections import defaultdict

from modules import shapes
from modules.rules import route_of, store_calls
from modules.source import files_in, reader_of, text_of
from modules.tags import file_tags, insert_tags, read_tags
from .guesses import (DECLARATION, GENERIC_FOLDERS, UI_TEST_HINTS, _any_match, _slug, _ui_kind,
                      looks_like_test, looks_like_tooling)


def draft_tags(root: Path, hidden: bool = False) -> dict:
    """{path: [statements]} for every file that has no tag yet.

    Tests and tooling are found by their names. UI is found by where
    frameworks put it. A folder named features holds features. The rest is
    one module per folder, its front door what the program takes across
    today, so the program passes at once and only what reaches in shows red.
    An old codegraph.json, if there is one, says the modules instead.
    """
    files = files_in(root, hidden)
    index = {f.name: f for f in files}
    have = {f.name: file_tags(f) for f in files}
    todo = [f for f in files if have[f.name] is None]

    seed: dict = {}
    old = root / DECLARATION
    if old.exists():
        try:
            seed = json.loads(old.read_text(encoding="utf-8")).get("modules", {}) or {}
        except (ValueError, AttributeError):
            seed = {}

    groups = sorted({f.group for f in files})
    def short(group: str) -> str:
        # packages/core/src is "core": src and lib say nothing about the job
        parts = group.split("/")
        while len(parts) > 1 and parts[-1] in GENERIC_FOLDERS:
            parts.pop()
        return parts[-1]
    lasts = defaultdict(int)
    for g in groups:
        lasts[short(g)] += 1
    def name_of(group: str) -> str:
        if group == ".":
            return _slug(root.resolve().name)
        return short(group) if lasts[short(group)] == 1 else group

    # what every file is, as tags already say or as the draft guesses
    kind: dict = {}
    for f in files:
        t = have[f.name]
        if t is not None:
            kind[f.name] = (t.kind, t.name, t.system)
            continue
        homes = [n for n, m in seed.items() if _any_match(f.rel, m.get("files", []))]
        parts = f.rel.split("/")
        if looks_like_test(f.rel):
            kind[f.name] = ("test", "", "")
        elif looks_like_tooling(f.rel):
            kind[f.name] = ("tooling", "", "")
        elif homes:
            kind[f.name] = ("module", homes[0], "")
        elif "features" in parts[:-1]:
            rest = parts[parts.index("features") + 1:]
            stem = rest[-1].rsplit(".", 1)[0]
            system = rest[0] if len(rest) > 1 else "main"
            name = rest[1] if len(rest) > 2 else (stem if stem != "index" or len(rest) < 2
                                                  else rest[-2])
            kind[f.name] = ("feature", _slug(name), _slug(system))
        elif _ui_kind(f):
            k, n = _ui_kind(f)
            kind[f.name] = (k, n, "")
        else:
            kind[f.name] = ("module", name_of(f.group), "")

    def unit(name: str) -> str:
        k, n, _ = kind[name]
        return k + ":" + n if k in ("module", "feature", "page", "component") else k

    out: dict = {f.rel: [] for f in todo}
    mine = {f.rel for f in todo}
    members: dict = defaultdict(list)
    for f in files:
        members[unit(f.name)].append(f)

    # what crosses between units today: front doors, uses, what tests touch
    door: dict = defaultdict(set)
    door_from: dict = defaultdict(lambda: defaultdict(int))
    uses: dict = defaultdict(set)
    touched: dict = defaultdict(lambda: defaultdict(int))
    for f in files:
        here = unit(f.name)
        for u in reader_of(f).uses(f, index):
            there = unit(u.target) if u.target in kind else None
            if not there or there == here:
                continue
            touched[f.name][there] += 1
            if there.startswith("module:"):
                if here.startswith("feature:"):
                    uses[here].add(there[7:])
                if u.name and not here.startswith(("test", "tooling")):
                    door[there].add(u.name)
                    door_from[there][u.target] += 1
        for l in reader_of(f).links(f, index):
            if l.target and l.target in kind and unit(l.target) != here:
                there = unit(l.target)
                touched[f.name].setdefault(there, 0)
                if here.startswith("feature:") and there.startswith("module:"):
                    uses[here].add(there[7:])

    has_door = {unit(f.name) for f in files if have[f.name] and have[f.name].door is not None}
    for uid, fs in sorted(members.items()):
        k = uid.split(":")[0]
        new = [f for f in fs if f.rel in mine]
        if not new:
            continue
        name = uid.split(":", 1)[1] if ":" in uid else ""
        for f in new:
            if k == "feature":
                out[f.rel].append("feature {} in {}".format(name, kind[f.name][2]))
            elif k == "page":
                out[f.rel].append("page " + name)
            elif k == "design":
                out[f.rel].append("design system")
            elif k in ("module", "component", "tooling"):
                out[f.rel].append(k + (" " + name if name else ""))
        if k == "module" and uid not in has_door:
            names = set(seed.get(name, {}).get("front_door", [])) or door[uid]
            # the door goes on the folder's own index file, else where most names come from
            heads = [f for f in new if f.path.stem in ("__init__", "index")]
            best = heads[0] if heads else max(new, key=lambda f: (door_from[uid][f.name], -len(f.rel)))
            out[best.rel].append("front door " + (", ".join(sorted(names)) or "none"))
        if k == "feature":
            first = new[0]
            if uses[uid]:
                out[first.rel].append("uses " + ", ".join(sorted(uses[uid])))

    # tests: of a feature, of the UI, or of the module they touch most
    for f in todo:
        if kind[f.name][0] != "test":
            continue
        text = text_of(f)
        hit = touched[f.name]
        feats = [u for u in hit if u.startswith("feature:")]
        mods = sorted((u for u in hit if u.startswith("module:")), key=lambda u: -hit[u])
        if any(h in text for h in UI_TEST_HINTS) or any(
                p in ("e2e", "playwright", "cypress") for p in f.rel.split("/")):
            out[f.rel].append("test ui")
        elif feats:
            out[f.rel].append("test feature " + sorted(feats)[0][8:])
        elif mods:
            out[f.rel].append("test module " + mods[0][7:])
        else:
            out[f.rel].append("test ui")

    # stores: each table or collection the modules reach, owned by the one
    # that writes it most, its tag on the schema where the owner holds one
    calls: dict = defaultdict(lambda: defaultdict(lambda: [0, None]))
    declared = {s for f in files if have[f.name] for s, _, _ in have[f.name].stores}
    for f in files:
        uid = unit(f.name)
        if not uid.startswith("module:"):
            continue
        for name, how, line in store_calls(text_of(f), f.lang):
            c = calls[name][uid]
            c[0] += 2 if how == "writes" else 1
            c[1] = c[1] or f
    schemas: list = []
    for f in files:
        schemas += shapes.schemas_in(f.rel, text_of(f))
    for name in sorted(calls):
        if name in declared:
            continue
        by = calls[name]
        owner_uid = max(by, key=lambda u: (by[u][0], u))
        found = shapes.find(schemas, name)
        place = next((f for f in members[owner_uid] if found and f.rel == found.rel), by[owner_uid][1])
        if place.rel in out:
            out[place.rel].append("store " + name)
        for reader_uid in sorted(set(by) - {owner_uid}):
            f = by[reader_uid][1]
            if f.rel in out:
                out[f.rel].append("reads " + name)

    # the start page: the one at /, else one called home, app or index
    page_rels = {rel: lines for rel, lines in out.items() if lines and lines[0].startswith("page ")}
    if page_rels and not any(have[f.name] and have[f.name].start for f in files):
        start = next((r for r in sorted(page_rels) if route_of(r) == "/"), None) or \
            next((r for r in sorted(page_rels) if page_rels[r][0].split()[1] in
                  ("home", "app", "index")), None)
        if start:
            out[start][0] = "start " + out[start][0]
    return {rel: lines for rel, lines in out.items() if lines}


def as_tags(drafts: dict) -> dict:
    """The draft read back as tags, for drawing a codebase nobody has tagged."""
    return {rel: read_tags("\n".join("# codegraph: " + l for l in lines))
            for rel, lines in drafts.items()}


def write_drafts(root: Path, drafts: dict) -> None:
    for rel, lines in drafts.items():
        path = root / rel
        text = path.read_text(encoding="utf-8")
        comment = "#" if rel.endswith(".py") else "//"
        path.write_text(insert_tags(text, lines, comment), encoding="utf-8", newline="")
