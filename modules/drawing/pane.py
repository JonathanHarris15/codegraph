# codegraph: module drawing
from __future__ import annotations

from collections import defaultdict

from modules.source import KINDS


# ------------------------------------------------------------- for the mod
#
# The mod beside the chat reads a summary, not the page: the systems and
# their features, the modules, pages and stores, the mismatches, and a small
# picture of the map.

def summary(graph: dict) -> dict:
    m = graph.get("map") or {}
    nodes = (m.get("views") or {}).get("map", {}).get("nodes", [])
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
    return {
        "root": graph["root"], "source": m.get("source", "none"),
        "systems": [{"name": s, "features": f} for s, f in sorted(systems.items())],
        "modules": [brief(n, "door", "stores", "reads") for n in
                    sorted(by_kind["module"], key=lambda n: n["label"])],
        "pages": [brief(n, "route", "start") for n in sorted(by_kind["page"], key=lambda n: n["label"])],
        "components": [brief(n) for n in sorted(by_kind["component"], key=lambda n: n["label"])],
        "stores": [{"id": n["id"], "name": n["label"], "owner": n["owner"], "fields": n["fields"]}
                   for n in sorted(by_kind["store"], key=lambda n: n["label"])],
        "mismatches": m.get("mismatches", []), "unknown": m.get("unknown", []),
        "svg": map_svg(m["views"]["map"]) if m else "",
    }


def _rel_of(graph: dict, fid: str) -> str:
    n = next((n for n in graph["nodes"] if n["id"] == fid), None)
    return (n["dir"] + "/" + n["label"] if n and n["dir"] != "." else n["label"]) if n else fid


SVG_HUES = {"module": 210, "feature": 150, "page": 280, "component": 300, "design": 30,
            "store": 175, "trigger": 45, "outside": 0, "loose": 0}


def map_svg(view: dict, limit: int = 120000) -> str:
    """The map as one plain SVG picture: cards in their columns, wires as
    curves, red where a rule is broken. Empty if it would be too big to send."""
    W, H, GX, GY = 150, 34, 70, 12
    cols: dict = defaultdict(list)
    for n in view["nodes"]:
        cols[n["col"]].append(n)
    tallest = max((len(v) for v in cols.values()), default=1)
    at = {}
    for c, ns in cols.items():
        ns.sort(key=lambda n: n["row"])
        top = (tallest - len(ns)) * (H + GY) / 2
        for i, n in enumerate(ns):
            at[n["id"]] = (c * (W + GX) + 10, top + i * (H + GY) + 10)
    width = (max(cols, default=0) + 1) * (W + GX) + 20
    height = tallest * (H + GY) + 20
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {} {}" font-family="system-ui,'
           'sans-serif" font-size="11">'.format(int(width), int(height))]
    for e in view["edges"]:
        if e["from"] not in at or e["to"] not in at:
            continue
        (x1, y1), (x2, y2) = at[e["from"]], at[e["to"]]
        if x1 < x2:
            a, b = (x1 + W, y1 + H / 2), (x2, y2 + H / 2)
        elif x1 > x2:
            a, b = (x1, y1 + H / 2), (x2 + W, y2 + H / 2)
        else:                                   # one column: loop out to the right
            a, b = (x1 + W, y1 + H / 2), (x2 + W, y2 + H / 2)
        bad = e.get("bad") or e.get("why")
        hue = KINDS.get(e["kind"], {}).get("hue")
        colour = "#d33" if bad else ("hsl({},55%,55%)".format(hue) if hue is not None else "#999")
        bend = max(30, abs(b[0] - a[0]) * 0.45)
        da, db = (1, -1) if x1 < x2 else (-1, 1) if x1 > x2 else (1, 1)
        out.append('<path d="M{:.0f} {:.0f} C{:.0f} {:.0f} {:.0f} {:.0f} {:.0f} {:.0f}" fill="none" '
                   'stroke="{}" stroke-width="{}" opacity="0.8"/>'.format(
                       a[0], a[1], a[0] + da * bend, a[1], b[0] + db * bend, b[1], b[0], b[1],
                       colour, 2 if bad else 1.2))
    for n in view["nodes"]:
        x, y = at[n["id"]]
        hue = SVG_HUES.get(n["kind"], 0)
        sat = "0%" if n["kind"] in ("outside", "loose", "file", "external") else "55%"
        label = n["label"] if len(n["label"]) <= 22 else n["label"][:21] + "…"
        out.append('<rect x="{:.0f}" y="{:.0f}" width="{}" height="{}" rx="{}" fill="hsl({},{},55%)" '
                   'fill-opacity="0.18" stroke="hsl({},{},50%)"/>'.format(
                       x, y, W, H, 12 if n["kind"] == "feature" else 5, hue, sat, hue, sat))
        out.append('<text x="{:.0f}" y="{:.0f}" fill="hsl({},{},45%)" font-weight="600">{}</text>'
                   .format(x + 8, y + 15, hue, sat, _xml(label)))
        out.append('<text x="{:.0f}" y="{:.0f}" fill="#888" font-size="9">{}</text>'.format(
            x + 8, y + 27, _xml(n["kind"] if n["kind"] != "outside" else "outside")))
    out.append("</svg>")
    svg = "".join(out)
    return svg if len(svg) <= limit else ""


def _xml(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
