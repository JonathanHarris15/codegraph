# codegraph: module shapes
"""A module's own answer to what its store holds, worked out while it runs.

A shape still comes from something the program runs, never a comment
(docs/adr/0003, amended by docs/adr/0006). Usually that is a schema sitting in
the code, which codegraph reads. Sometimes the fields are not in the code to
read: a catalogue of columns the people using the app add to and switch on and
off lives in the database, and the code holds only the machinery that assembles
it. There the store's shape was shown as unknown, which is honest and useless.

A shape helper closes that. It is a file of the module that owns the store,
tagged

    # codegraph: shape of sales

which prints the shape as JSON when it is run:

    {"name": "Sale", "fields": {"saleNo": "text", "acres": "number"}}

`fields` may be pairs instead, `[["saleNo", "text"], ...]`, when the order
matters more than the shape of the JSON; `name` is optional. Anything the
helper prints before the JSON is ignored, so it may talk while it works.

codegraph runs the helper and takes it at its word. What the helper reads to
work the answer out is the owning module's business — its own catalogue, or the
live store. A helper that fails, times out or prints nothing useful leaves the
shape unknown and says why; it never stops the map being drawn. Set
CODEGRAPH_NO_HELPERS=1 to draw the map without running any of them.

The front door is `helper_shape`, which runs one helper.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from .schemas import Schema


# How codegraph runs a helper, by what the file is written in.
RUNTIMES = {
    ".py": [sys.executable],
    ".js": ["node"], ".mjs": ["node"], ".cjs": ["node"],
    ".ts": ["node"], ".mts": ["node"],
}

TIMEOUT = 30             # seconds; a helper that reads a live store needs a few


def helper_shape(root: Path, rel: str, store: str, timeout: float = TIMEOUT):
    """Run one shape helper. Returns (Schema, "") or (None, what went wrong)."""
    path = Path(root) / rel
    runtime = RUNTIMES.get(path.suffix.lower())
    if not runtime:
        return None, "codegraph has no way to run a {} file".format(path.suffix or "file")
    try:
        done = subprocess.run(runtime + [str(path)], cwd=str(root), timeout=timeout,
                              capture_output=True, text=True, errors="replace")
    except FileNotFoundError:
        return None, "{} is not installed".format(runtime[0])
    except subprocess.TimeoutExpired:
        return None, "it did not finish within {:g} seconds".format(timeout)
    except OSError as e:
        return None, "it could not be run ({})".format(e)
    if done.returncode:
        return None, _why(done)
    fields = _fields(done.stdout or "")
    if fields is None:
        return None, "it printed no JSON object with fields in it" + (
            " ({})".format(_why(done)) if _why(done) else "")
    s = Schema(_name(done.stdout) or store, rel, 0, table=store)
    s.fields = fields
    return s, ""


def _why(done) -> str:
    """The last thing a helper said before it gave up."""
    said = [l.strip() for l in (done.stderr or "").splitlines() if l.strip()]
    if said:
        return said[-1][:200]
    return "it stopped with code {}".format(done.returncode) if done.returncode else ""


def _printed(out: str):
    """The last JSON object or array the helper printed, whatever else it said.

    The last one it printed, not the last one inside it: what a value contains
    is skipped over, so `{"fields": {...}}` is read as the object it is.
    """
    reader, found, i = json.JSONDecoder(), None, 0
    while i < len(out):
        if out[i] not in "{[":
            i += 1
            continue
        try:
            value, end = reader.raw_decode(out[i:])
        except ValueError:
            i += 1
            continue
        found, i = value, i + max(end, 1)
    return found


def _name(out: str) -> str:
    value = _printed(out)
    return str(value.get("name") or "") if isinstance(value, dict) else ""


def _fields(out: str):
    """[(name, kind)] from what the helper printed, or None when there is none."""
    value = _printed(out)
    if isinstance(value, dict):
        value = value.get("fields", value if "name" not in value else None)
    if isinstance(value, dict):
        return [(str(k), _kind(v)) for k, v in value.items()]
    if isinstance(value, list):
        out_fields = []
        for item in value:
            if isinstance(item, (list, tuple)) and item:
                out_fields.append((str(item[0]), _kind(item[1]) if len(item) > 1 else ""))
            elif isinstance(item, dict) and item.get("name"):
                out_fields.append((str(item["name"]), _kind(item.get("type", ""))))
            elif isinstance(item, str):
                out_fields.append((item, ""))
        return out_fields or None
    return None


def _kind(value) -> str:
    return "" if value is None else str(value)
