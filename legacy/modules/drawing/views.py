# codegraph: module drawing
from __future__ import annotations

from collections import defaultdict

from modules.layout import place_by_file, place_inside, place_map, size_cards
from modules.planning import compare, designs_in, drawable_wires, read_plans
from modules.previews import previews_of
from modules.rules import UI_KINDS, relation
from modules.source import EXTERNAL, OUTSIDE


# ----------------------------------------------------------------- map views
#
# The page's levels. The map: every module, feature, page and component as a
# card, with the stores, triggers and outside connections they touch, and the
# wires between them. The pages: where a person can go. Inside each card, its
# own files beside the cards they touch.

STORES, TRIGGERS, UI_GROUP = "(stores)", "(triggers)", "(ui)"
NAMED_WIRES = ("import", "lazy", "uses", "informed", "acts", "contains")
TESTS_CARD, TOOLING_CARD, LOOSE_CARD = "test", "tooling", "(untagged)"


def _group(u: Unit) -> str:
    if u.kind == "feature":
        return "system:" + (u.system or "?")
    if u.kind in UI_KINDS:
        return UI_GROUP
    return u.id


def _about(u: Unit, n: int) -> str:
    files = "1 file" if n == 1 else "{} files".format(n)
    if u.kind == "feature":
        return "{} · {}".format(u.system or "no system", files)
    if u.kind == "page":
        return "{}{} · {}".format("start · " if u.start else "", u.route or "page", files)
    if u.kind in ("component", "design"):
        return "{} · {}".format("design system" if u.kind == "design" else "component", files)
    return files


def map_views(root: Path, graph: dict, r: Reading, source: str = "tags") -> dict:
    shown = {n["id"]: n for n in graph["nodes"]}
    is_file = {f.name for f in r.files}
    units = r.units

    def card(fid: str) -> str:
        if fid not in is_file:
            return fid                                  # outside or third party
        return r.owner.get(fid, LOOSE_CARD)

    cards: dict = {}
    for uid, u in units.items():
        ids = sorted(n for n in u.files if n in shown)
        cards[uid] = {
            "id": uid, "label": u.name or ("design system" if u.kind == "design" else u.kind),
            "kind": u.kind, "dir": _about(u, len(ids)), "group": _group(u),
            "lines": sum(shown[i]["lines"] for i in ids), "files": ids,
            "door": sorted(u.door or ()), "system": u.system, "uses": sorted(u.uses),
            "route": u.route, "start": u.start,
            "stores": sorted(s for s, v in r.stores.items() if v["owner"] == uid),
            "reads": sorted(u.reads),
        }
    path_of = {f.name: f.path for f in r.files}
    seen = previews_of(root, [{"id": c["id"], "name": c["label"], "route": c["route"],
                               "files": [path_of[i] for i in units[c["id"]].files if i in path_of]}
                              for c in cards.values() if c["kind"] == "page"])
    for pid, shot in seen.items():
        cards[pid]["preview"] = shot
    loose = sorted(n["id"] for n in graph["nodes"] if n["kind"] == "file" and card(n["id"]) == LOOSE_CARD)
    if loose:
        cards[LOOSE_CARD] = {"id": LOOSE_CARD, "label": "untagged", "kind": "loose",
                             "dir": "{} files with no tag".format(len(loose)), "group": LOOSE_CARD,
                             "lines": sum(shown[i]["lines"] for i in loose), "files": loose}
    for s, v in r.stores.items():
        schema = v["schema"]
        cards["store:" + s] = {
            "id": "store:" + s, "label": s, "kind": "store", "group": STORES, "lines": 0,
            "dir": "owned by " + units[v["owner"]].name, "files": [],
            "fields": schema.lines() if schema else [],
            "schema": "{}:{}".format(schema.rel, schema.line) if schema else "",
            "owner": v["owner"], "readers": sorted(v["readers"]),
        }
    for t in r.triggers:
        cards[t["id"]] = {"id": t["id"], "label": t["label"], "kind": "trigger",
                          "group": TRIGGERS, "lines": 0, "dir": t["kind"], "files": [],
                          "fields": t["fields"], "feature": t["feature"]}

    def kind_of(e: dict):
        """The wire an import between two files is, by what the files belong to,
        and the rules it breaks. None when it is no wire on the map."""
        k = e["kind"]
        ua, ub = r.owner.get(e["from"]), r.owner.get(e["to"])
        if k not in ("import", "lazy") or not ua or not ub or ua == ub:
            return k, []
        wire, wrong = relation(units[ua].kind, units[ub].kind)
        why = r.bad.get((ua, ub), [])
        if wrong:
            return "import", why or [wrong]
        if wire is None:
            return None, []
        return (k if wire == "import" else wire), why

    def view(title: str, unit: str, own: list, mapping, keep, group: str = "",
             inside: str = "", extra: tuple = ({}, [])) -> dict:
        """Lift the file graph through `mapping`, keep the wires that touch
        `own` between cards that `keep` allows, and lay out what is left.
        Inside a card, its stores and triggers wire to the file that holds
        the store's tag, else to its first file. `extra` is the ghosts of
        what plans ask for and the code has not got: cards, and wires."""
        ghosts, planned = extra
        def anchor(other: str) -> str:
            s = r.stores.get(other[6:]) if other.startswith("store:") else None
            held = next((f.name for f in r.files if s and f.rel == s["rel"]), None)
            return held if held in own else own[0]
        wires: dict = {}
        for e in graph["edges"]:
            a, b = mapping(e["from"]), mapping(e["to"])
            if a == b or not (a in own or b in own) or not (keep(a) and keep(b)):
                continue
            k, why = kind_of(e)
            if k is None:
                continue
            key = (a, b, "import" if k in ("import", "lazy") else k)
            w = wires.setdefault(key, {"from": a, "to": b, "kind": k, "names": set(),
                                       "bad": set(), "via": set(), "why": set()})
            if w["kind"] == "lazy" and k == "import":
                w["kind"] = "import"      # a real import beats one in a function
            if a != e["from"]:
                w["via"].add(e["from"])   # the files on a card this wire comes from
            w["why"] |= set(why)
        named: dict = defaultdict(list)
        for w in wires.values():
            if w["kind"] in NAMED_WIRES:
                named[(w["from"], w["to"])].append(w)
        for c in r.crossings:
            for w in named.get((mapping(c.src), mapping(c.dst)), ()):
                w["names"].add(c.name)
                if not c.ok:
                    w["bad"].add(c.name)
        for a, b, k in r.wires:
            if inside:                       # the card's own end lands on one of its files
                a, b = (anchor(b) if a == inside else a), (anchor(a) if b == inside else b)
            if (a in own or b in own) and (a in cards or a in own) and                     (b in cards or b in own) and keep(a) and keep(b):
                wires.setdefault((a, b, k), {"from": a, "to": b, "kind": k, "names": set(),
                                             "bad": set(), "via": set(), "why": set()})
        edges = [dict(w, names=sorted(w["names"]), bad=sorted(w["bad"]), via=sorted(w["via"]),
                      why=sorted(w["why"]))
                 for _, w in sorted(wires.items())]
        known = set(own) | set(cards) | set(ghosts)
        edges += [w for w in planned if w["from"] in known and w["to"] in known
                  and (w["from"] in own or w["to"] in own) and keep(w["from"]) and keep(w["to"])]

        ids = list(dict.fromkeys(own + [x for w in edges for x in (w["from"], w["to"])]))
        nodes = [dict(ghosts.get(i) or cards.get(i) or shown[i]) for i in ids]
        size_cards(nodes)
        tail = [g for g in (EXTERNAL, STORES, OUTSIDE) if any(n["group"] == g for n in nodes)]
        pairs = [(w["from"], w["to"]) for w in edges if w["kind"] != "leads"]
        if unit == "files":
            for n in nodes:
                n["own"] = n["id"] in own
            col, row, columns = place_inside(nodes, pairs, set(own), tail)
        elif unit == "pages":
            col, row, columns = place_by_file(nodes, [(b, a) for a, b in
                                                      ((w["from"], w["to"]) for w in edges)], [])
        else:
            col, row, columns, blocks = place_map(
                nodes, pairs, [(w["from"], w["to"]) for w in edges if w["kind"] == "leads"])
            at = {i: b for b in blocks if not b.get("within") for i in b["cards"]}
            for n in nodes:
                n["block"], n["tier"] = at[n["id"]]["id"], at[n["id"]]["tier"]
        for n in nodes:
            n["col"], n["row"] = col[n["id"]], row[n["id"]]
        groups = list(dict.fromkeys(n["group"] for n in nodes if n["group"] not in tail))
        placed = {"title": title, "unit": unit, "nodes": nodes, "edges": edges,
                  "columns": columns, "groups": groups + tail, "group": group}
        if unit == "units":
            placed["blocks"] = [{k: b[k] for k in ("id", "label", "within") if k in b} for b in blocks]
        return placed

    on_map = [c for c, v in cards.items() if v["kind"] not in ("test", "tooling")]
    keep = lambda c: c not in (TESTS_CARD, TOOLING_CARD)
    views = {"map": view("Map", "units", sorted(on_map), card, keep)}
    plans = compare(read_plans(root), views["map"]["nodes"], views["map"]["edges"])
    ghosts, planned, notes = _ghosts(plans, set(cards))
    if ghosts or planned:
        views["map"] = view("Map", "units", sorted(on_map) + sorted(ghosts), card, keep,
                            extra=(ghosts, planned))
    top = ["map"]
    pages = sorted(c for c, v in list(cards.items()) + list(ghosts.items()) if v["kind"] == "page")
    if pages:
        views["pages"] = view("Pages", "pages", pages, card, lambda c: c in pages,
                              extra=(ghosts, planned))
        top.append("pages")
    for v in (views["map"], views.get("pages")):
        for n in (v or {}).get("nodes", []):
            if n["id"] in notes and not n.get("ghost"):
                n.update(notes[n["id"]])
        _pin_comments(v, plans)
    for cid in on_map:
        own = cards[cid]["files"]
        if own:
            views[cid] = view(cards[cid]["label"], "files", own,
                              lambda fid, own=set(own): fid if fid in own else card(fid),
                              lambda c: c not in (TESTS_CARD, TOOLING_CARD),
                              cards[cid]["group"], cid)

    return {"source": source, "top": top, "views": views, "plans": plans,
            "wiring": [list(w) for w in drawable_wires()], "designs": designs_in(root),
            "mismatches": [str(m) for m in r.mismatches],
            "unknown": [str(u) for u in r.unknown]}


# ------------------------------------------------------------------ ghosts
#
# What plans ask for and the code has not got yet, drawn over the map: a card
# the map lacks becomes a ghost card, a wire it lacks a ghost wire, and a card
# it has but short of what was asked carries what is left to build.

def _ghosts(plans: list, real: set = frozenset()) -> tuple:
    """({id: ghost card}, [ghost wire], {id: what a real card is still asked for}).
    Where the agent has revised a drawing, what it struck out of the drawing
    is drawn too, struck, so the two can be read against each other."""
    ghosts: dict = {}
    notes: dict = {}
    wires: list = []
    for p in plans:
        for c in p["cards"]:
            if c["built"] or c["id"] in ghosts or c["id"] in notes:
                continue
            said = {k: c[k] for k in ("about", "program", "takes", "gives", "roles", "triggers",
                                      "problems", "design", "change", "was") if c.get(k)}
            if c["left"] != ["not on the map yet"]:
                notes[c["id"]] = dict(said, plan=p["name"], left=c["left"])
                continue
            door = [d.get("name", "") if isinstance(d, dict) else str(d) for d in c.get("door") or []]
            ghosts[c["id"]] = dict(said, **{
                "id": c["id"], "label": c["name"], "kind": c["kind"], "ghost": True,
                "plan": p["name"], "left": c["left"], "group": _ghost_group(c),
                "dir": "planned · " + p["name"], "lines": 0, "files": [],
                "door": door, "doors": [d for d in c.get("door") or [] if isinstance(d, dict)],
                "system": c.get("system", ""), "route": c.get("route", ""),
                "start": bool(c.get("start")), "uses": [], "stores": [], "reads": [],
                "owner": "module:" + str(c.get("owner", "")).replace("module:", "")
                         if c["kind"] == "store" else "",
                "fields": ["{}: {}".format(k, v) if v else k
                           for k, v in (c.get("fields") or {}).items()]})
        for s in p.get("struck") or []:
            if s["id"] in ghosts or s["id"] in real:
                continue
            ghosts[s["id"]] = {"id": s["id"], "label": s["name"], "kind": s["kind"], "ghost": True,
                               "struck": True, "plan": p["name"], "left": [], "about": s["about"],
                               "group": _ghost_group(s), "dir": "struck out · " + p["name"], "lines": 0,
                               "files": [], "door": [], "doors": [], "system": "", "route": "",
                               "start": False, "uses": [], "stores": [], "reads": [], "owner": "",
                               "fields": []}
        for w in p["wires"]:
            if not w["built"]:
                wires.append({"from": w["from"], "to": w["to"], "kind": w["kind"], "names": [],
                              "bad": [], "via": [], "why": list(w["problems"]), "plan": p["name"],
                              "carries": w.get("carries", ""), "about": w.get("about", ""),
                              "change": w.get("change", "")})
        for w in p.get("struck_wires") or []:
            wires.append({"from": w["from"], "to": w["to"], "kind": w["kind"], "names": [], "bad": [],
                          "via": [], "why": [], "plan": p["name"], "struck": True,
                          "about": w.get("about", "")})
    return ghosts, wires, notes


def _pin_comments(view: dict | None, plans: list) -> None:
    """Each comment in a plan, on the card or wire it is about: a wire's is
    on `from <words> to`, so its first and last words find it."""
    if not view:
        return
    nodes = {n["id"]: n for n in view["nodes"]}
    for p in plans:
        for c in p.get("comments") or []:
            said = {"by": c["by"], "text": c["text"], "plan": p["name"]}
            on = c["on"].split()
            if len(on) == 1 and on[0] in nodes:
                nodes[on[0]].setdefault("comments", []).append(said)
            elif len(on) > 1:
                for e in view["edges"]:
                    if e["from"] == on[0] and e["to"] == on[-1] and not e.get("struck"):
                        e.setdefault("comments", []).append(said)
                        break


def _ghost_group(c: dict) -> str:
    if c["kind"] == "system":           # a box of its own among the features
        return "system:" + c["name"]
    if c["kind"] == "feature":
        return "system:" + (c.get("system") or "?")
    if c["kind"] in UI_KINDS:
        return UI_GROUP
    if c["kind"] == "store":
        return STORES
    return c["id"]
