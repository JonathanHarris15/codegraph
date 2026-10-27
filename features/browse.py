# codegraph: feature browse-map in mapping
# codegraph: uses drawing, web
from __future__ import annotations

import json

from modules.drawing import map_of, render
from modules.web import Server


def browse(root: Path, port: int = 0, hidden: bool = False, say=print) -> Server:
    """The map as a live page on this machine. What the person asks from it
    is said as one JSON line, `{"ask": text}`, for whoever started it to put
    in the chat; a refresh reads the repo again. Call `serve_forever` on what
    comes back; `{"ready": url}` is said first."""
    held = {"graph": map_of(root, hidden=hidden)}

    def again() -> None:
        held["graph"] = map_of(root, hidden=hidden)

    server = Server(page=lambda live: render(held["graph"], live),
                    on_ask=lambda text: say(json.dumps({"ask": text})),
                    on_refresh=again, port=port)
    say(json.dumps({"ready": server.url}))
    return server
