# codegraph: module drawing
from __future__ import annotations

import json
from pathlib import Path


TEMPLATE = Path(__file__).with_name("template.html")


# -------------------------------------------------------------------- render

def render(graph: dict) -> str:
    html = TEMPLATE.read_text(encoding="utf-8")
    if "/*__GRAPH__*/null" not in html:
        raise SystemExit(str(TEMPLATE) + " has no /*__GRAPH__*/null placeholder")
    return html.replace("/*__GRAPH__*/null", json.dumps(graph, indent=1))


def nodes_by_id(graph: dict) -> dict:
    return {n["id"]: n for n in graph["nodes"]}
