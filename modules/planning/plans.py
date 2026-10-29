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
               {"kind": "page", "name": "rota", "route": "/rota"},
               {"kind": "component", "name": "people-picker"}],
     "wires": [{"from": "page:rota", "kind": "acts on", "to": "feature:remind"}]}

A card or wire is built once the map read from the code has it, with every
detail the plan asks for. Program, roles, takes and gives ride along on the
card: the code does not tell codegraph those yet.
"""
from __future__ import annotations

import json
from pathlib import Path

from modules.rules import relation

PLANS = "plans"
CARD_KINDS = ("module", "feature", "page", "component", "store")
TRIGGER_KINDS = ("schedule", "event", "command")
# the words CONTEXT.md uses for each wire, and the map's own name for it
WIRE_WORDS = {"uses": "uses", "informed by": "informed", "acts on": "acts", "contains": "contains",
              "writes": "writes", "reads": "reads", "leads to": "leads", "imports": "import"}
WIRE_NAMES = {v: k for k, v in WIRE_WORDS.items()}
KEPT = ("about", "program", "takes", "gives", "roles", "system", "route", "start",
        "door", "owner", "fields", "triggers")


def read_plans(root: Path) -> list:
    """Every plan waiting in the repo, by file name: {name, file, data} or,
    for a file that is not a plan, {name, file, error}."""
    folder = Path(root) / PLANS
    out = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        p = {"name": path.stem, "file": PLANS + "/" + path.name}
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
            out.append((p["file"], "plan {} is built: delete it".format(p["name"])))
    return out


def compare(plans: list, nodes: list, edges: list) -> list:
    """Each plan held against the map: its cards and wires, each built or with
    what is left to build, and the rules it breaks."""
    return [_compare(p, nodes, edges) for p in plans]


def _norm(s: str) -> str:
    return " ".join(str(s).lower().split())


def _compare(p: dict, nodes: list, edges: list) -> dict:
    out = {"name": p["name"], "file": p["file"], "ask": "", "cards": [], "wires": [],
           "problems": [], "built": False}
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
            c["problems"].append("a plan's card is a module, feature, page, component or store, "
                                 "not " + (kind or "nothing"))
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
        if "carries" in raw:
            w["carries"] = raw["carries"]
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
    return out


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
