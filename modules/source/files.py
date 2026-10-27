# codegraph: module source
from __future__ import annotations

import subprocess
from dataclasses import dataclass


SKIP_DIRS = {
    ".git", ".hg", ".svn", ".venv", "venv", "env", "__pycache__", "node_modules",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".eggs",
    "build", "dist", "site-packages", ".idea", ".vscode",
}


# --------------------------------------------------------------------- model

@dataclass(frozen=True)
class File:
    """One source file, and the name other files would import it by."""
    name: str          # atp.engine.tick, or src/lib/calendar.ts
    path: Path
    rel: str           # atp/engine/tick.py
    group: str         # atp/engine  (the folder it sits in)
    package: str       # atp.engine  (what a relative import counts from)
    lines: int
    lang: str = "python"   # which reader made it

    @property
    def label(self) -> str:
        return self.path.name


# ----------------------------------------------------------------- discovery

def _kept_by_git(root: Path) -> set | None:
    """Every file git would not ignore, or None when git cannot say.

    Asked afresh on every read, and deliberately not cached: `--serve` reads
    the repo again on each refresh, and a file written while it is running is
    one git has not been told about yet. A remembered answer would leave that
    file off the map until the server was restarted.

    SKIP_DIRS names the folders every project has, but what a project calls
    its build output is its own business: a Vite build lands in `public/`
    when Firebase Hosting serves from there, and a minified copy of the whole
    app is then sitting beside the app. The repo already says which files
    those are, so this asks it rather than guessing at more names.

    Run with `-C root`, git reports paths relative to root whether root is the
    repository or a folder inside one. A folder that is no repository at all
    gets None, and is read whole.
    """
    try:
        done = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard"],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode:
        return None
    return {line.strip() for line in done.stdout.splitlines() if line.strip()}


def discover(root: Path, hidden: bool = False,
             suffixes: tuple = (".py",)) -> list[Path]:
    """Every source file under root with one of these endings, minus the
    usual noise and anything the repo ignores.

    Dotted folders are skipped unless asked for: a folder whose name starts
    with a dot cannot be imported, so anything in one is tooling, not code the
    project runs.

    Generated code that was COMMITTED stays: it ships, so it is part of the
    program whoever wrote it.
    """
    kept = _kept_by_git(root)
    found: list[Path] = []
    for path in sorted(p for p in root.rglob("*") if p.suffix in suffixes and p.is_file()):
        rel = path.relative_to(root)
        parts = rel.parts[:-1]
        if any(p in SKIP_DIRS for p in parts):
            continue
        if not hidden and any(p.startswith(".") for p in parts):
            continue
        if kept is not None and rel.as_posix() not in kept:
            continue
        found.append(path)
    return found


def file_of(path: Path, root: Path) -> File:
    """Work out the dotted name, folder group and package for one file."""
    rel = path.relative_to(root)
    parts = list(rel.parts)
    stem = parts[-1][:-3]                       # drop .py
    folder = parts[:-1]

    if stem == "__init__":
        name_parts = folder                     # the package IS the module
    else:
        name_parts = folder + [stem]

    return File(
        name=".".join(name_parts) or stem,
        path=path,
        rel=rel.as_posix(),
        group="/".join(folder) if folder else ".",
        package=".".join(folder),
        lines=_count_lines(path),
    )


def _count_lines(path: Path) -> int:
    try:
        return len(path.read_text(encoding="utf-8", errors="replace").splitlines())
    except OSError:
        return 0


# ------------------------------------------------------------------- readers
#
# Everything that depends on the language a file is written in sits behind a
# reader. A reader turns a file into its name, the imports it makes, the
# names it takes from other files and the connections it makes outside. The
# rest of codegraph works on files, names and wires, whatever the language.

@dataclass(frozen=True)
class Link:
    """One import: the file in the codebase it lands on, or failing that the
    third-party package it reaches instead."""
    target: str | None     # a file's name in the index
    package: str | None    # a third-party package, when target is None
    nested: bool           # written inside a function


@dataclass(frozen=True)
class Use:
    """One name a file takes from another file in the project."""
    target: str          # dotted name of the file the name comes from
    name: str | None     # None when it cannot be told which name
    line: int
    why: str = ""


@dataclass(frozen=True)
class Act:
    """One name a file takes from another file in the project, used in code
    that runs when a person acts: a click, a submit, a pick."""
    target: str          # dotted name of the file the name comes from
    name: str | None
    line: int
    by: str              # what runs it: onClick, handleSave, on_save


def text_of(f: File) -> str:
    try:
        return f.path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
