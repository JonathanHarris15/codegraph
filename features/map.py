# codegraph: feature draw-map in mapping
# codegraph: uses drawing
from __future__ import annotations

from modules.drawing import map_of


def draw_map(root: Path, externals: bool = False, hidden: bool = False, outside: bool = True,
             layout: str = "file", keep_empty: bool = False) -> dict:
    """The map of a repo, for the page, the pane or the JSON."""
    return map_of(root, externals=externals, hidden=hidden, outside=outside, layout=layout,
                  keep_empty=keep_empty)
