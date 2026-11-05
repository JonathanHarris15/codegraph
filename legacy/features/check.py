# codegraph: feature check in checking
# codegraph: uses rules, drawing, planning
from __future__ import annotations

from modules.drawing import build
from modules.planning import left_behind
from modules.rules import Finding, Report, read_map


def check(root: Path, hidden: bool = False) -> Report:
    """Read the code back against its tags: every file tagged, every name that
    crosses into a module on its front door, every import one the layers
    allow, every store reached only by its modules, every page reachable.
    A plan still waiting is no mismatch; one built and left behind is."""
    r = read_map(root, hidden)
    plans = build(root, hidden=hidden, reading=r)["map"]["plans"]
    behind = [Finding(rel, 0, text) for rel, text in left_behind(plans)]
    return Report(sorted(r.mismatches + behind), r.unknown)
