# codegraph: feature draft-tags in setup
# codegraph: uses drafting
from __future__ import annotations

from modules.drafting import DECLARATION, draft_tags, write_drafts


def draft(root: Path, hidden: bool = False) -> tuple:
    """Write a first tag into every file that has none. (the tags written,
    by path; whether an old codegraph.json seeded them)"""
    drafts = draft_tags(root, hidden=hidden)
    write_drafts(root, drafts)
    return drafts, (root / DECLARATION).exists()
