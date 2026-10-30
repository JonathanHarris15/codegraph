# codegraph: feature browse-map in mapping
# codegraph: uses drawing, web, planning, previews
from __future__ import annotations

import json

from modules.drawing import fresh_map_of, map_of, render
from modules.planning import design_file, write_plan
from modules.previews import preview_file
from modules.web import Server


def browse(root: Path, port: int = 0, hidden: bool = False, say=print) -> Server:
    """The map as a live page on this machine. What the person asks from it
    is said as one JSON line, `{"ask": text}`, for whoever started it to put
    in the chat; a refresh reads the repo again; a plan drawn on it is
    written to `plans/`; a design, or a picture a UI test took of a page, is
    served to show on its card. Call `serve_forever` on what comes back;
    `{"ready": url}` is said first."""
    held = {"graph": map_of(root, hidden=hidden)}

    def again() -> None:
        # read by codegraph as it is now, which may have changed since this
        # server started
        held["graph"] = fresh_map_of(root, hidden=hidden)

    def plan(body: dict) -> dict:
        return {"file": write_plan(root, body.get("name", ""), body.get("plan"),
                                   body.get("designs") or {})}

    server = Server(page=lambda live: render(held["graph"], live),
                    on_ask=lambda text: say(json.dumps({"ask": text})),
                    on_refresh=again, port=port, on_plan=plan,
                    design=lambda rel: design_file(root, rel) or preview_file(root, rel))
    say(json.dumps({"ready": server.url}))
    return server
