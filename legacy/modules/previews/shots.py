# codegraph: module previews
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from modules.rules import route_matches


# Where a UI test leaves what it saw: for each picture, a .json beside it,
#   {"url": the address it was at, "taken": when, "picture": where it is,
#    "page": the page's name, where its route cannot be read}.
# The picture may be anywhere in the repo, as Cypress keeps its own.
SHOTS = Path(".codegraph") / "shots"
# What each page's files held when codegraph first saw a picture of it, kept
# beside the pictures: a picture is stale once its page holds something else.
# Times will not do: a commit, a checkout or a branch switch writes files
# afresh, with a new time and the same words.
SEEN = Path(".codegraph") / "previews-seen.json"
PICTURES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def previews_of(root: Path, pages: list) -> dict:
    """{page id: its newest picture}, for pages given as {id, name, route,
    files}: the picture's path, the address it was taken at, when, and
    whether it is stale: its page's files hold something other than they did
    when codegraph first saw the picture. A page changed between the test
    and that first look goes unnoticed; the map is read again after every
    turn, so that is seldom long."""
    newest: dict = {}
    for shot in _shots(root):
        hit = _page_of(shot, pages)
        if hit and (hit["id"] not in newest or shot["at"] > newest[hit["id"]]["at"]):
            newest[hit["id"]] = dict(shot, page=hit)
    seen = _read_seen(root)
    kept, out = {}, {}
    for pid, s in newest.items():
        key = "{} {}".format(s["picture"], s["taken"])
        now = _fingerprint(s["page"]["files"])
        kept[key] = then = seen.get(key) or now
        out[pid] = {"picture": s["picture"], "url": s["url"], "taken": s["taken"],
                    "stale": now != then}
    if kept != seen:
        _write_seen(root, kept)
    return out


def preview_file(root: Path, rel: str) -> tuple | None:
    """(bytes, media type) of a picture a UI test took, or None for anything
    else: only a picture a shot names is ever served."""
    if not any(s["picture"] == rel for s in _shots(root)):
        return None
    path = Path(root) / rel
    return path.read_bytes(), PICTURES[path.suffix.lower()]


def _fingerprint(files: list) -> str:
    """What a page's files hold, as one short string; line endings aside, as
    git may write them either way."""
    digest = hashlib.sha1()
    for f in sorted(str(f) for f in files):
        try:
            digest.update(Path(f).read_bytes().replace(b"\r\n", b"\n"))
        except OSError:
            digest.update(b"gone")
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def _read_seen(root: Path) -> dict:
    try:
        seen = json.loads((Path(root) / SEEN).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return seen if isinstance(seen, dict) else {}


def _write_seen(root: Path, seen: dict) -> None:
    try:
        (Path(root) / SEEN).write_text(json.dumps(seen, indent=1, sort_keys=True), encoding="utf-8")
    except OSError:
        pass                      # a folder it cannot write to just sees afresh next time


def _shots(root: Path) -> list:
    """Each shot that can be read and whose picture is in the repo, with its
    time as a number to compare."""
    root = Path(root).resolve()
    folder = root / SHOTS
    out = []
    for said in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            s = json.loads(said.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(s, dict):
            continue
        picture = (root / str(s.get("picture") or "")).resolve()
        if root not in picture.parents or picture.suffix.lower() not in PICTURES or not picture.is_file():
            continue
        taken = str(s.get("taken") or "")
        try:
            at = datetime.fromisoformat(taken.replace("Z", "+00:00"))
            at = (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).timestamp()
        except ValueError:
            at = said.stat().st_mtime
            taken = datetime.fromtimestamp(at, timezone.utc).isoformat(timespec="seconds")
        out.append({"picture": picture.relative_to(root).as_posix(), "taken": taken, "at": at,
                    "url": urlsplit(str(s.get("url") or "")).path or "/",
                    "name": str(s.get("page") or "")})
    return out


def _page_of(shot: dict, pages: list) -> dict | None:
    """The page a shot shows: the one it names, else the one its address
    reaches, a route written out beating one with parts that take any."""
    if shot["name"]:
        return next((p for p in pages if shot["name"] in (p["name"], p["id"])), None)
    hits = [p for p in pages if p["route"] and route_matches(shot["url"], p["route"])]
    loose = lambda p: sum(part[:1] in "[:" for part in p["route"].split("/"))
    return min(hits, key=loose, default=None)
