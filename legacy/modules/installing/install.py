# codegraph: module installing
"""Codegraph is turned on by naming its marketplace and enabling the plugin
in a Claude settings file: once in a person's own settings, for every project
they open, and in each repo's committed `.claude/settings.json`, for everyone
who opens that repo. The marketplace lists the plugin by a relative path, so
Claude Code loads it from the marketplace's own copy: nobody runs an install
of their own. Both name the same plugin, so a person who has both has one.

The rules go between the codegraph markers in the repo's `CLAUDE.md` (or
`AGENTS.md`, where the repo keeps its agent rules there), the same block
setup writes, so every agent there builds in the three layers."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

MARKETPLACE = "codegraph"
REPO = "JonathanHarris15/codegraph"
PLUGIN = "codegraph@" + MARKETPLACE
IGNORED = ".codegraph/"
START, END = "<!-- codegraph:start -->", "<!-- codegraph:end -->"
CONTEXT_BLOCK = (Path(__file__).resolve().parents[2] / "skills/setup/CONTEXT-BLOCK.md").read_text(encoding="utf-8")


@dataclass
class Installed:
    changed: list = field(default_factory=list)  # paths written, relative to the repo
    problems: list = field(default_factory=list)  # what it could not do, and why


def install_in(root: Path) -> Installed:
    """Turn codegraph on in the repo at root. Keeps everything the repo's
    files already say; changes nothing that is already right."""
    done = Installed()
    _settings(root / ".claude/settings.json", ".claude/settings.json", done)
    _rules(root, done)
    _ignore(root, done)
    return done


def install_for_profile(path: Path | None = None) -> Installed:
    """Turn codegraph on in the person's own Claude settings, for every
    project they open: those at path, else the ones Claude Code reads
    (`CLAUDE_CONFIG_DIR`, else `~/.claude`). Keeps every other setting."""
    if path is None:
        path = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude") / "settings.json"
    done = Installed()
    _settings(path, str(path), done)
    return done


def _settings(path: Path, rel: str, done: Installed) -> None:
    """Name the marketplace, unless the settings already name one by that
    name (a fork, or a copy in a folder), and turn the plugin on."""
    settings: dict = {}
    if path.exists():
        try:
            settings = json.loads(path.read_text(encoding="utf-8") or "{}")
        except ValueError as e:
            done.problems.append("{} is not JSON codegraph can read ({}): left as it is".format(rel, e))
            return
        if not isinstance(settings, dict):
            done.problems.append("{} does not hold an object: left as it is".format(rel))
            return
    want = json.loads(json.dumps(settings))
    want.setdefault("extraKnownMarketplaces", {}).setdefault(MARKETPLACE, {
        "source": {"source": "github", "repo": REPO}, "autoUpdate": True})
    want.setdefault("enabledPlugins", {})[PLUGIN] = True
    if want != settings:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(want, indent=2) + "\n", encoding="utf-8")
        done.changed.append(rel)


def _rules(root: Path, done: Installed) -> None:
    rel = "AGENTS.md" if (root / "AGENTS.md").exists() and not (root / "CLAUDE.md").exists() else "CLAUDE.md"
    path = root / rel
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    block = CONTEXT_BLOCK.rstrip("\n")
    start, end = old.find(START), old.find(END)
    if start >= 0 and end > start:
        new = old[:start] + block + old[end + len(END):]
    elif old:
        new = old.rstrip("\n") + "\n\n" + block + "\n"
    else:
        new = block + "\n"
    if new != old:
        path.write_text(new, encoding="utf-8")
        done.changed.append(rel)


def _ignore(root: Path, done: Installed) -> None:
    path = root / ".gitignore"
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    if IGNORED in (line.strip() for line in old.splitlines()):
        return
    path.write_text(old + ("" if not old or old.endswith("\n") else "\n") + IGNORED + "\n", encoding="utf-8")
    done.changed.append(".gitignore")
