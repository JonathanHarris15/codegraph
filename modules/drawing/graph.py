# codegraph: module drawing
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from modules.layout import order_groups, place_by_file, place_by_folder
from modules.source import EXTERNAL, KINDS, OUTSIDE, files_in, reader_of
from .views import map_views


# --------------------------------------------------------------------- build

def build(root: Path, externals: bool = False, hidden: bool = False,
          outside: bool = True, layout: str = "file",
          keep_empty: bool = False, reading: "Reading | None" = None,
          source: str = "tags") -> dict:
    files = files_in(root, hidden)
    index = {m.name: m for m in files}

    edges: dict = {}
    ext_hits: dict = defaultdict(int)
    endpoints: dict = {}

    def add(src: str, dst: str, kind: str) -> None:
        if src == dst:
            return
        key = (src, dst)
        # a real top-level import beats the same one hidden in a function
        if edges.get(key) == "import":
            return
        edges[key] = kind

    def note_endpoint(conn: Conn) -> None:
        was = endpoints.get(conn.target)
        if was is None or (was["dir"].endswith("not in the source") and conn.detail):
            endpoints[conn.target] = {
                "id": conn.target, "label": conn.label, "dir": conn.detail,
                "group": OUTSIDE, "lines": 0, "kind": "outside",
            }

    for f in files:
        reader = reader_of(f)
        for link in reader.links(f, index):
            kind = "lazy" if link.nested else "import"
            if link.target:
                add(f.name, link.target, kind)
                continue
            ext_hits[link.package] += 1
            if externals:
                add(f.name, "ext:" + link.package, kind)

        if outside:
            for conn in reader.outside(f):
                note_endpoint(conn)
                add(f.name, conn.target, conn.kind)

    if not keep_empty:
        # An empty __init__.py that nothing imports is a folder marker, not a
        # file. Left in, it crowds the entry-point column with cards that
        # have no wires at all.
        wired = {s for s, _ in edges} | {d for _, d in edges}
        files = [m for m in files
                   if m.lines or m.path.name != "__init__.py" or m.name in wired]

    tail = ([EXTERNAL] if externals else []) + ([OUTSIDE] if endpoints else [])
    groups = order_groups(files, edges, tail)
    rank = {g: i for i, g in enumerate(groups)}

    nodes = [
        {
            "id": m.name,
            "label": m.label,
            "dir": m.group,
            "group": m.group,
            "lines": m.lines,
            "kind": "file",
        }
        for m in sorted(files, key=lambda m: (rank.get(m.group, 0), m.rel))
    ]
    if externals:
        nodes += [
            {
                "id": "ext:" + name,
                "label": name,
                "dir": "third party",
                "group": EXTERNAL,
                "lines": 0,
                "kind": "external",
            }
            for name in sorted(ext_hits)
        ]
    nodes += [endpoints[k] for k in sorted(endpoints)]

    wires = [{"from": s, "to": d, "kind": k} for (s, d), k in sorted(edges.items())]
    used = sorted({w["kind"] for w in wires}, key=list(KINDS).index)

    pairs = [(w["from"], w["to"]) for w in wires]
    if layout == "folder":
        col, row, columns = place_by_folder(nodes, groups)
    else:
        col, row, columns = place_by_file(nodes, pairs, tail)
    for n in nodes:
        n["col"], n["row"] = col[n["id"]], row[n["id"]]

    graph = {
        "root": root.resolve().name,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "layout": layout,
        "groups": groups,
        "columns": columns,
        "kinds": {k: KINDS[k] for k in used},
        "nodes": nodes,
        "edges": wires,
        "externals_seen": dict(sorted(ext_hits.items(), key=lambda kv: (-kv[1], kv[0]))),
    }
    if reading is not None:
        graph["map"] = map_views(root, graph, reading, source)
        seen = set(used) | {e["kind"] for v in graph["map"]["views"].values()
                            for e in v["edges"]}
        graph["kinds"] = {k: KINDS[k] for k in KINDS if k in seen}
    return graph
