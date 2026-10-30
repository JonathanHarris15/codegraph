# codegraph: module drawing
from __future__ import annotations

import json
from collections import defaultdict


# ------------------------------------------------------------- for the mod
#
# The mod beside the chat reads a summary, not the page: the systems and
# their features, the modules, pages and stores, every view on the map
# (trimmed to what the pane draws), and the mismatches, each sorted into the
# group setup reports it under and pinned to the card it belongs to.

# What each view's cards and wires keep for the pane.
NODE_KEYS = ("id", "label", "kind", "dir", "col", "row", "tier", "block", "size", "own", "system", "door", "uses",
             "route", "start", "fields", "owner", "ghost", "plan", "left", "preview")
VIEW_LIMIT = 600000          # past this many characters, only the map and the pages travel

# The groups setup reports mismatches in, worst first: (group, label, words
# a mismatch of that group says). The first group whose words match wins.
ISSUE_GROUPS = (
    ("layers", "Layers broken", ("never calls", "never reaches", "never imports", "has no wires",
                                 "not a wire codegraph knows", "only a module reaches")),
    ("doors", "Front doors crossed", ("front door",)),
    ("stores", "Stores and schemas", ("store", "schema")),
    ("pages", "Triggers and pages", ("trigger", "page", "UI test", "walks")),
    ("fakes", "Tests faking code", ("fakes ",)),
    ("tags", "Tags to correct", ()),
)


def group_of(text: str) -> str:
    return next(g for g, _, words in ISSUE_GROUPS if not words or any(w in text for w in words))


def _kept(v) -> bool:
    """Worth sending: a 0 is a column, but an empty list or a false flag is nothing."""
    return v is not None and v is not False and v != "" and v != []


def _trim(view: dict) -> dict:
    def bad(e: dict) -> list:
        return list(e.get("bad") or []) + list(e.get("why") or [])
    return dict({
        "title": view.get("title", ""),
        "columns": [c.get("label", "") for c in view.get("columns", [])],
        "nodes": [{k: n[k] for k in NODE_KEYS if _kept(n.get(k))} for n in view["nodes"]],
        "edges": [dict({"from": e["from"], "to": e["to"], "kind": e["kind"]},
                       **({"bad": bad(e)[:3]} if bad(e) else {}),
                       **({"plan": e["plan"]} if e.get("plan") else {})) for e in view["edges"]],
    }, **({"blocks": view["blocks"]} if view.get("blocks") else {}))


def issues_of(graph: dict) -> list:
    """Each mismatch on the map apart: its file, line and text, its group,
    and the map card and file card it belongs to."""
    m = graph["map"]
    cards = {fid: n["id"] for n in m["views"]["map"]["nodes"] for fid in n.get("files", [])}
    file_of = {_rel_of(graph, n["id"]): n["id"] for n in graph["nodes"] if n["kind"] == "file"}
    out = []
    for f in m["mismatches"]:
        where, _, text = f.partition("  ")
        rel, _, line = where.partition(":")
        fid = file_of.get(rel, "")
        out.append({"text": text, "rel": rel, "line": int(line) if line.isdigit() else 0,
                    "line_text": f, "group": group_of(text), "file": fid,
                    "card": cards.get(fid, "")})
    return out


def summary(graph: dict) -> dict:
    m = graph.get("map") or {}
    views = m.get("views") or {}
    nodes = views.get("map", {}).get("nodes", [])
    by_kind: dict = defaultdict(list)
    for n in nodes:
        by_kind[n["kind"]].append(n)
    systems: dict = defaultdict(list)
    triggers = defaultdict(list)
    for t in by_kind["trigger"]:
        triggers[t["feature"]].append("{} {}".format(t["dir"], t["label"]))
    for n in sorted(by_kind["feature"], key=lambda n: n["label"]):
        systems[n["system"] or "no system"].append({
            "id": n["id"], "name": n["label"], "uses": n["uses"],
            "triggers": triggers[n["id"]], "files": [_rel_of(graph, i) for i in n["files"]]})
    def brief(n: dict, *keys) -> dict:
        return dict({"id": n["id"], "name": n["label"],
                     "files": [_rel_of(graph, i) for i in n.get("files", [])]},
                    **{k: n.get(k) for k in keys})
    trimmed = {k: _trim(v) for k, v in views.items()}
    if len(json.dumps(trimmed)) > VIEW_LIMIT:
        trimmed = {k: v for k, v in trimmed.items() if k in ("map", "pages")}
    return {
        "root": graph["root"], "source": m.get("source", "none"),
        "systems": [{"name": s, "features": f} for s, f in sorted(systems.items())],
        "modules": [brief(n, "door", "stores", "reads") for n in
                    sorted(by_kind["module"], key=lambda n: n["label"])],
        "pages": [dict(brief(n, "route", "start"), **({"preview": {k: n["preview"][k] for k in ("taken", "stale")}}
                                                       if n.get("preview") else {}))
                  for n in sorted(by_kind["page"], key=lambda n: n["label"])],
        "components": [brief(n) for n in sorted(by_kind["component"], key=lambda n: n["label"])],
        "stores": [{"id": n["id"], "name": n["label"], "owner": n["owner"], "fields": n["fields"]}
                   for n in sorted(by_kind["store"], key=lambda n: n["label"])],
        "mismatches": m.get("mismatches", []), "unknown": m.get("unknown", []),
        "issues": m.get("issues", []), "groups": m.get("groups", []),
        "plans": m.get("plans", []),
        "views": trimmed,
    }


def _rel_of(graph: dict, fid: str) -> str:
    n = next((n for n in graph["nodes"] if n["id"] == fid), None)
    return (n["dir"] + "/" + n["label"] if n and n["dir"] != "." else n["label"]) if n else fid
