# codegraph: module web
"""Serves one page on this machine and hears what the person asks from it.

Everything sits under a secret first part of the path, and a request that
comes from another site is turned away, so only the page this server handed
out can reach it:

    GET  /<secret>/           the page
    GET  /<secret>/version    {"version": n}: the page reloads when n moves
    POST /<secret>/ask        {"text": ...}: what the person asked, passed on
    POST /<secret>/refresh    read the repo again, then move the version on
    POST /<secret>/plan       a plan drawn on the page, to write; its answer back
    GET  /<secret>/design/... a design kept beside a plan, boxed in: it may not
                              run a script or reach this server
"""
from __future__ import annotations

import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

MAX_BODY = 100000
MAX_PLAN = 30000000          # a plan carries its designs: screens and pages of HTML


class Server(ThreadingHTTPServer):
    """A page server bound to this machine alone. `page(live)` draws the
    page, `on_ask(text)` hears a request, `on_refresh()` reads the repo again,
    `on_plan(body)` writes a plan and answers (ValueError: refused, and why),
    and `design(path)` gives a design's (bytes, media type), or None."""

    daemon_threads = True

    def __init__(self, page, on_ask, on_refresh, port: int = 0, on_plan=None, design=None):
        super().__init__(("127.0.0.1", port), _Handler)
        self.page, self.on_ask, self.on_refresh = page, on_ask, on_refresh
        self.on_plan, self.design = on_plan, design
        self.secret = secrets.token_urlsafe(18)
        self.version = 0
        self.lock = threading.Lock()

    @property
    def url(self) -> str:
        return "http://127.0.0.1:{}/{}/".format(self.server_address[1], self.secret)

    def live(self) -> dict:
        base = "/" + self.secret + "/"
        return {"ask": base + "ask", "version": base + "version", "refresh": base + "refresh",
                "plan": base + "plan", "design": base + "design/", "at": self.version}

    def refresh(self) -> int:
        with self.lock:
            self.on_refresh()
            self.version += 1
            return self.version


class _Handler(BaseHTTPRequestHandler):
    server: Server

    def log_message(self, *args) -> None:       # the console is the mod's channel
        pass

    def _route(self) -> str | None:
        parts = urlsplit(self.path).path.split("/", 2)
        if len(parts) < 2 or not secrets.compare_digest(parts[1], self.server.secret):
            return None
        return parts[2] if len(parts) > 2 else ""

    def _same_site(self) -> bool:
        origin = self.headers.get("Origin")
        port = self.server.server_address[1]
        return origin is None or origin in ("http://127.0.0.1:{}".format(port),
                                            "http://localhost:{}".format(port))

    def _send(self, status: int, body, kind: str = "application/json",
              boxed: bool = False) -> None:
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", kind + ("" if isinstance(body, bytes) else "; charset=utf-8"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if boxed:
            self.send_header("Content-Security-Policy", "sandbox")
            self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        route = self._route()
        if route == "":
            self._send(200, self.server.page(self.server.live()), "text/html")
        elif route == "version":
            self._send(200, json.dumps({"version": self.server.version}))
        elif route and route.startswith("design/") and self.server.design:
            found = self.server.design(unquote(route[len("design/"):]))
            if found is None:
                self._send(404, json.dumps({"error": "not here"}))
            else:
                self._send(200, found[0], found[1], boxed=True)
        else:
            self._send(404, json.dumps({"error": "not here"}))

    def do_POST(self) -> None:
        route = self._route()
        # read what was sent before answering, refusals too: a socket closed
        # with data still unread is reset on Windows, and the answer is lost
        size = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(min(size, MAX_PLAN if route == "plan" else MAX_BODY))
        if route not in ("ask", "refresh", "plan") or (route == "plan" and not self.server.on_plan):
            self._send(404, json.dumps({"error": "not here"}))
            return
        if not self._same_site():
            self._send(403, json.dumps({"error": "another site cannot ask"}))
            return
        if route == "refresh":
            self._send(200, json.dumps({"version": self.server.refresh()}))
            return
        if route == "plan":
            try:
                sent = json.loads(body or b"{}")
                if not isinstance(sent, dict):
                    raise ValueError("a plan comes as an object")
                self._send(200, json.dumps(self.server.on_plan(sent)))
            except ValueError as e:
                self._send(400, json.dumps({"error": str(e)}))
            return
        try:
            text = json.loads(body or b"{}").get("text", "")
        except (ValueError, AttributeError):
            text = ""
        if not isinstance(text, str) or not text.strip():
            self._send(400, json.dumps({"error": "nothing to ask"}))
            return
        self.server.on_ask(text)
        self._send(200, json.dumps({"ok": True}))
