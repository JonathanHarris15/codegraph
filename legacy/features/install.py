# codegraph: feature install in setup
# codegraph: uses installing
from __future__ import annotations

from modules.installing import install_for_profile, install_in


def install(root: Path):
    """Turn codegraph on in a repo for everyone who opens it. (what it
    wrote, what it could not)"""
    return install_in(root)


def install_profile():
    """Turn codegraph on in the person's own Claude settings, for every
    project they open. (what it wrote, what it could not)"""
    return install_for_profile()
