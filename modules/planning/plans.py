# codegraph: module planning
"""A plan is a change someone wants made, waiting in `plans/<name>.json` until
it is built (docs/adr/0008):

    {"ask": "what was asked for, in the asker's words",
     "cards": [{"kind": "feature", "name": "remind", "system": "calendar",
                "about": "plain words", "program": "server", "roles": ["elder"],
                "takes": "a week", "gives": "who was reminded",
                "triggers": ["schedule every Monday at 09:00"]},
               {"kind": "module", "name": "mail", "door": ["send", {"name": "bounce", "takes": "..."}]},
               {"kind": "store", "name": "reminders", "owner": "reminders", "fields": {"sent": "date"}},
               {"kind": "page", "name": "rota", "route": "/rota", "design": "plans/<name>/rota.png"},
               {"kind": "component", "name": "people-picker"},
               {"kind": "system", "name": "billing", "about": "the features it should hold"}],
     "wires": [{"from": "page:rota", "kind": "acts on", "to": "feature:remind"}]}

A card or wire is built once the map read from the code has it, with every
detail the plan asks for. Program, roles, takes and gives ride along on the
card: the code does not tell codegraph those yet. Nor does a page's design:
a screen or a page of HTML, kept beside the plan in `plans/<name>/` and
deleted with it. A system card names a collection of features and says in
plain words what they should be, for the agent to work out; it is built once
a feature on the map sits in it.

A plan drawn on the map keeps the drawing as the person left it, under
`drawing`. The agent then revises the cards and wires in place, says why in
`comments` (`{"on": card id, or "from kind to" for a wire, "by": "agent",
"text": ...}`), and sets `reviewed`; the map shows what it added, struck out
and reworded against the drawing, as suggestions. The person's own comments
ride along the same way, `by` the person.
"""
from __future__ import annotations

import base64
import binascii
import json
import re
from pathlib import Path

from modules.rules import relation
from modules.source import DESIGNS as DESIGN_FOLDER

PLANS = "plans"
CARD_KINDS = ("module", "feature", "page", "component", "store", "system")
TRIGGER_KINDS = ("schedule", "event", "command")
# the words CONTEXT.md uses for each wire, and the map's own name for it
WIRE_WORDS = {"uses": "uses", "informed by": "informed", "acts on": "acts", "contains": "contains",
              "writes": "writes", "reads": "reads", "leads to": "leads", "imports": "import"}
WIRE_NAMES = {v: k for k, v in WIRE_WORDS.items()}
KEPT = ("about", "program", "takes", "gives", "roles", "system", "route", "start",
        "door", "owner", "fields", "triggers", "design")
# what a design may be, and how it is served back
DESIGNS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
           ".webp": "image/webp", ".svg": "image/svg+xml", ".html": "text/html"}
NAME = re.compile(r"[a-z0-9][a-z0-9-]*$")
FILE = re.compile(r"[a-z0-9][a-z0-9_-]*(\.[a-z0-9]+)$")


def read_plans(root: Path) -> list:
    """Every plan waiting in the repo, by file name: {name, file, data} or,
    for a file that is not a plan, {name, file, error}."""
    folder = Path(root) / PLANS
    out = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        p = {"name": path.stem, "file": PLANS + "/" + path.name}
        if (folder / path.stem).is_dir():
            p["designs"] = "{}/{}/".format(PLANS, path.stem)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            p["error"] = "it is not JSON ({})".format(str(e).split(":")[0])
        else:
            if not isinstance(data, dict):
                p["error"] = "it is not an object with cards and wires"
            else:
                p["data"] = data
        out.append(p)
    return out


def left_behind(plans: list) -> list:
    """(file, what is wrong) for every plan that should not still be here: one
    that is built, and one codegraph cannot read."""
    out = []
    for p in plans:
        if p.get("error"):
            out.append((p["file"], "is not a plan codegraph can read: " + p["error"]))
        elif p["built"]:
            out.append((p["file"], "plan {} is built: delete it{}".format(
                p["name"], " and its designs in " + p["designs"] if p.get("designs") else "")))
    return out


def write_plan(root: Path, name: str, plan: dict, designs: dict) -> str:
    """Write a plan drawn on the map, and its designs beside it, as
    `{file: data URL}`. Where the plan went; ValueError for a name, a file or
    a plan that could land anywhere else, or one already waiting."""
    if not NAME.match(str(name)):
        raise ValueError("a plan's name is lower case letters, numbers and dashes: " + repr(name))
    if not isinstance(plan, dict):
        raise ValueError("a plan is an object with cards and wires")
    folder = Path(root) / PLANS
    if (folder / (name + ".json")).exists():
        raise ValueError("a plan named {} is already waiting".format(name))
    files = {}
    for file, url in (designs or {}).items():
        m = FILE.match(str(file))
        if not m or m.group(1) not in DESIGNS:
            raise ValueError("a design is a {} file with a plain name: {!r}".format(
                ", ".join(DESIGNS), file))
        head, _, data = str(url).partition(",")
        try:
            files[file] = base64.b64decode(data, validate=True) if head.endswith(";base64")                 else data.encode("utf-8")
        except (binascii.Error, ValueError):
            raise ValueError("design {} is not a data URL".format(file))
    if files:
        (folder / name).mkdir(parents=True, exist_ok=True)
        for file, raw in files.items():
            (folder / name / file).write_bytes(raw)
    if plan.get("drawn") and "drawing" not in plan:
        # what the person drew, kept whole, for the agent's revision to be read against
        plan = dict(plan, drawing={"cards": plan.get("cards") or [], "wires": plan.get("wires") or []})
    folder.mkdir(exist_ok=True)
    (folder / (name + ".json")).write_text(json.dumps(plan, indent=1) + "\n", encoding="utf-8")
    return "{}/{}.json".format(PLANS, name)


# the kinds of card a person draws on the map, and may wire together
DRAWN = ("module", "feature", "page", "component", "store")


def drawable_wires() -> list:
    """(from kind, to kind, wire word) for every wire the rules allow between
    two kinds of card a person draws, in the words a plan uses. A module
    writes a store it owns and reads one it does not; this says writes."""
    out = []
    for a in DRAWN:
        for b in DRAWN:
            if (a, b) == ("module", "store"):
                out.append((a, b, "writes"))
            elif (a, b) == ("page", "page"):
                out.append((a, b, "leads to"))
            else:
                wire, wrong = relation(a, b)
                if wire and not wrong:
                    out.append((a, b, WIRE_NAMES[wire]))
    return out


def designs_in(root: Path) -> list:
    """The pages exported from Claude Design into the repo's `designs/`
    folder, for a page to take: each picture or page of HTML in it, and each
    folder in it with an index.html, by name."""
    folder = Path(root) / DESIGN_FOLDER
    out = []
    for path in sorted(folder.iterdir()) if folder.is_dir() else []:
        page = path / "index.html" if path.is_dir() else path
        if page.is_file() and page.suffix.lower() in DESIGNS:
            out.append({"file": page.relative_to(root).as_posix(), "name": path.stem,
                        "type": "text/html" if page.suffix.lower() == ".html" else "image"})
    return out


def design_file(root: Path, rel: str) -> tuple | None:
    """(bytes, media type) of a design, or None for anything else: a design
    is only ever served from inside `plans/` or `designs/`."""
    path = (Path(root) / str(rel)).resolve()
    kind = DESIGNS.get(path.suffix.lower())
    inside = any((Path(root) / f).resolve() in path.parents for f in (PLANS, DESIGN_FOLDER))
    if not kind or not inside or not path.is_file():
        return None
    return path.read_bytes(), kind


def compare(plans: list, nodes: list, edges: list) -> list:
    """Each plan held against the map: its cards and wires, each built or with
    what is left to build, and the rules it breaks."""
    return [_compare(p, nodes, edges) for p in plans]


def _norm(s: str) -> str:
    return " ".join(str(s).lower().split())


def _compare(p: dict, nodes: list, edges: list) -> dict:
    out = {"name": p["name"], "file": p["file"], "ask": "", "cards": [], "wires": [],
           "problems": [], "built": False, "struck": [], "struck_wires": [], "comments": []}
    if p.get("designs"):
        out["designs"] = p["designs"]
    if p.get("error"):
        out["error"] = p["error"]
        out["problems"].append(p["error"])
        return out
    data = p["data"]
    out["ask"] = str(data.get("ask", ""))
    on_map = {n["id"]: n for n in nodes}
    have = {(e["from"], e["to"], "import" if e["kind"] == "lazy" else e["kind"]) for e in edges}

    cards = []
    for raw in data.get("cards") or []:
        raw = raw if isinstance(raw, dict) else {}
        kind, name = str(raw.get("kind", "")), str(raw.get("name", ""))
        c = {"id": "{}:{}".format(kind, name), "kind": kind, "name": name, "problems": []}
        c.update({k: raw[k] for k in KEPT if k in raw})
        if kind not in CARD_KINDS:
            c["problems"].append("a plan's card is a module, feature, page, component, store or "
                                 "system, not " + (kind or "nothing"))
        if not name:
            c["problems"].append("this card has no name")
        cards.append(c)
    planned = {c["id"]: c for c in cards}

    def kind_of(cid: str) -> str:
        c = planned.get(cid) or on_map.get(cid)
        return c["kind"] if c else ""

    wires = []
    for raw in data.get("wires") or []:
        raw = raw if isinstance(raw, dict) else {}
        word = _norm(raw.get("kind", ""))
        w = {"from": str(raw.get("from", "")), "to": str(raw.get("to", "")),
             "kind": WIRE_WORDS.get(word, word),
             "problems": []}
        for k in ("carries", "about"):
            if k in raw:
                w[k] = raw[k]
        wires.append(w)

    for w in wires:
        w["problems"] += _wire_rules(w, kind_of, planned, on_map)
        w["built"] = (w["from"], w["to"], w["kind"]) in have
    for c in cards:
        if c["kind"] in CARD_KINDS:
            c["problems"] += _card_rules(c, kind_of, wires, nodes, edges)
        c["left"] = _left(c, on_map.get(c["id"]), nodes) if c["kind"] in CARD_KINDS else []
        c["built"] = c["kind"] in CARD_KINDS and not c["left"]

    out["cards"], out["wires"] = cards, wires
    out["built"] = all(c["built"] for c in cards) and all(w["built"] for w in wires)
    out["comments"] = [{"on": str(c.get("on", "")), "by": str(c.get("by", "person")), "text": str(c.get("text", ""))}
                       for c in data.get("comments") or [] if isinstance(c, dict) and c.get("text")]
    if data.get("reviewed") and isinstance(data.get("drawing"), dict):
        _review(out, data["drawing"])
    return out


# what the agent may reword on a card the person drew, to be shown struck and inserted
REWORDED = ("about", "system", "route")


def _wire_key(w: dict) -> tuple:
    word = _norm(w.get("kind", ""))
    return str(w.get("from", "")), WIRE_WORDS.get(word, word), str(w.get("to", ""))


def _review(out: dict, drawing: dict) -> None:
    """Mark the agent's revision against the person's drawing: each card and
    wire it added, each card it reworded and what it said before, and what
    of the drawing it struck out."""
    drawn = {}
    for raw in drawing.get("cards") or []:
        if isinstance(raw, dict):
            drawn["{}:{}".format(raw.get("kind", ""), raw.get("name", ""))] = raw
    for c in out["cards"]:
        before = drawn.get(c["id"])
        if before is None:
            c["change"] = "added"
            continue
        was = {k: before.get(k, "") for k in REWORDED if (before.get(k) or "") != (c.get(k) or "")}
        c["change"] = "changed" if was else ""
        if was:
            c["was"] = was
    kept = {c["id"] for c in out["cards"]}
    out["struck"] = [{"id": i, "kind": str(r.get("kind", "")), "name": str(r.get("name", "")),
                      "about": str(r.get("about", ""))} for i, r in drawn.items() if i not in kept]
    drawn_wires = {_wire_key(w): w for w in drawing.get("wires") or [] if isinstance(w, dict)}
    for w in out["wires"]:
        w["change"] = "" if (w["from"], w["kind"], w["to"]) in drawn_wires else "added"
    now = {(w["from"], w["kind"], w["to"]) for w in out["wires"]}
    out["struck_wires"] = [{"from": a, "kind": k, "to": b, "about": str(w.get("about", ""))}
                           for (a, k, b), w in drawn_wires.items() if (a, k, b) not in now]


def _wire_rules(w: dict, kind_of, planned: dict, on_map: dict) -> list:
    a, b, k = w["from"], w["to"], w["kind"]
    if k not in WIRE_NAMES:
        return ["{} is not a wire codegraph knows; a plan's wires are {}".format(
            k or "nothing", ", ".join(WIRE_WORDS))]
    ka, kb = kind_of(a), kind_of(b)
    missing = [x for x, kx in ((a, ka), (b, kb)) if not kx]
    if missing:
        return ["{} is neither in the plan nor on the map".format(x) for x in missing]
    if k == "writes":
        if (ka, kb) != ("module", "store"):
            return ["a module writes a store; this runs from a {} to a {}".format(ka, kb)]
        store = planned.get(b) or on_map.get(b) or {}
        owner = str(store.get("owner", ""))
        owner = owner if owner.startswith("module:") else "module:" + owner
        if owner != a:
            return ["only its owner writes a store, and {} is owned by {}".format(
                b, owner[7:] or "no module")]
        return []
    if k == "reads":
        return [] if (ka, kb) == ("module", "store") else [
            "a module reads a store; this runs from a {} to a {}".format(ka, kb)]
    if k == "leads":
        return [] if ka in ("page", "shell") and kb == "page" else [
            "leads to runs from a page to a page, and stays in the UI"]
    wire, wrong = relation(ka, kb)
    if wrong:
        return [wrong]
    if wire != k:
        if k == "acts" and kb == "module":
            return ["acting lands on a feature, never straight on a module"]
        return ["a {} to a {} is {}, not {}".format(
            ka, kb, WIRE_NAMES.get(wire, "no wire") if wire else "no wire", WIRE_NAMES[k])]
    return []


def _card_rules(c: dict, kind_of, wires: list, nodes: list, edges: list) -> list:
    why = []
    if c["kind"] == "feature":
        if not c.get("system"):
            why.append("feature {} names no system".format(c["name"]))
        triggers = [str(t) for t in c.get("triggers") or []]
        for t in triggers:
            if t.split(" ", 1)[0] not in TRIGGER_KINDS:
                why.append("a trigger is a schedule, an event or a command, not " + t)
        acted = any(w["to"] == c["id"] and w["kind"] == "acts" for w in wires) or \
            any(e["to"] == c["id"] and e["kind"] == "acts" for e in edges) or \
            any(n.get("feature") == c["id"] for n in nodes)
        if not (triggers or acted):
            why.append("feature {} has no trigger: nothing acts on it, and it has no schedule, "
                       "event or command".format(c["name"]))
    if c["kind"] == "store":
        owner = str(c.get("owner", ""))
        if not owner:
            why.append("store {} names no owner".format(c["name"]))
        elif kind_of("module:" + owner.replace("module:", "")) != "module":
            why.append("store {}'s owner {} is not a module on the map or in the plan".format(
                c["name"], owner))
    return why


def _left(c: dict, real: dict | None, nodes: list) -> list:
    """What the map has not got yet of what the card asks for."""
    if c["kind"] == "system":            # a system is on the map once a feature is in it
        held = any(n.get("kind") == "feature" and n.get("system") == c["name"] for n in nodes)
        return [] if held else ["not on the map yet"]
    if real is None:
        return ["not on the map yet"]
    left = []
    if c["kind"] == "module":
        door = set(real.get("door") or ())
        for d in c.get("door") or []:
            name = d.get("name", "") if isinstance(d, dict) else str(d)
            if name and name not in door:
                left.append("front door lacks " + name)
    if c["kind"] == "feature":
        if c.get("system") and c["system"] != real.get("system"):
            left.append("is in system {}, not {}".format(real.get("system") or "none", c["system"]))
        there = {(_norm(n.get("dir", "")), _norm(n.get("label", ""))) for n in nodes
                 if n.get("kind") == "trigger" and n.get("feature") == c["id"]}
        for t in c.get("triggers") or []:
            kind, _, what = _norm(t).partition(" ")
            if kind in TRIGGER_KINDS and (kind, what) not in there:
                left.append("has no {} {}".format(kind, what))
    if c["kind"] == "page":
        if c.get("route") and c["route"] != real.get("route"):
            left.append("is at {}, not {}".format(real.get("route") or "no route", c["route"]))
        if c.get("start") and not real.get("start"):
            left.append("is not the start page")
        if c.get("design"):
            left.append("has a design codegraph cannot check: take it off this card once "
                        "the page matches it")
    if c["kind"] == "store":
        owner = str(c.get("owner", "")).replace("module:", "")
        has = str(real.get("owner", "")).replace("module:", "")
        if owner and owner != has:
            left.append("is owned by {}, not {}".format(has or "no module", owner))
        fields = {str(f).split(":")[0].strip() for f in real.get("fields") or ()}
        for f in c.get("fields") or {}:
            if f not in fields:
                left.append("lacks field " + f)
    return left
