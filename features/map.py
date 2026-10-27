# codegraph: feature draw-map in mapping
# codegraph: uses tags, drafting, rules, drawing
from __future__ import annotations

from modules.drafting import as_tags, draft_tags
from modules.drawing import build
from modules.rules import read_map
from modules.tags import tagged_at_all


def draw_map(root: Path, externals: bool = False, hidden: bool = False, outside: bool = True,
             layout: str = "file", keep_empty: bool = False) -> dict:
    """The map of a repo: every file and wire, and the views the page and
    the pane draw. It comes from the tags, or failing that from a draft of
    them, which the map labels as a draft."""
    drafted, source = None, "tags"
    if not tagged_at_all(root, hidden):
        drafted, source = as_tags(draft_tags(root, hidden)), "draft"
    reading = read_map(root, hidden, drafted)
    return build(root, externals=externals, hidden=hidden, outside=outside, layout=layout,
                 keep_empty=keep_empty, reading=reading, source=source)
