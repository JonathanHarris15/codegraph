# codegraph: feature check in checking
# codegraph: uses rules
from __future__ import annotations

from modules.rules import Report, read_map


def check(root: Path, hidden: bool = False) -> Report:
    """Read the code back against its tags: every file tagged, every name that
    crosses into a module on its front door, every import one the layers
    allow, every store reached only by its modules, every page reachable."""
    r = read_map(root, hidden)
    return Report(r.mismatches, r.unknown)
