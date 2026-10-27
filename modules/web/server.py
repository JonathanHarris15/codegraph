# codegraph: module web
"""Serves one page on this machine and hears what the person asks from it.

Everything sits under a secret first part of the path, and a request that
comes from another site is turned away, so only the page this server handed
out can reach it:

    GET  /<secret>/           the page
    GET  /<secret>/version    {"version": n}: the page reloads when n moves
    POST /<secret>/ask        {"text": ...}: what the person asked, passed on
    POST /<secret>/refresh    read the repo again, then move the version on
"""
from __future__ import annotations

import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

MAX_BODY = 100000


class Server(ThreadingHTTPServer):
    """A page server bound to this machine alone. `page(live)` draws the
    page, `on_ask(text)` hears a request, `on_refresh()` reads the repo again."""

    daemon_threads = True

    def __init__(self, page, on_ask, on_refresh, port: int = 0):
        super().__init__(("127.0.0.1", port), _Handler)
        self.page, self.on_ask, self.on_refresh = page, on_ask, on_refresh
        self.secret = secrets.token_urlsafe(18)
        self.version = 0
        self.lock = threading.Lock()

    @property
    def url(self) -> str:
        return "http://127.0.0.1:{}/{}/".format(self.server_address[1], self.secret)

    def live(self) -> dict:
        base = "/" + self.secret + "/"
        return {"ask": base + "ask", "version": base + "version", "refresh": base + "refresh",
                "at": self.version}

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

    def _send(self, status: int, body: str, kind: str = "application/json") -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", kind + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        route = self._route()
        if route == "":
            self._send(200, self.server.page(self.server.live()), "text/html")
        elif route == "version":
            self._send(200, json.dumps({"version": self.server.version}))
        else:
            self._send(404, json.dumps({"error": "not here"}))

    def do_POST(self) -> None:
        route = self._route()
        if route not in ("ask", "refresh"):
            self._send(404, json.dumps({"error": "not here"}))
            return
        if not self._same_site():
            self._send(403, json.dumps({"error": "another site cannot ask"}))
            return
        if route == "refresh":
            self._send(200, json.dumps({"version": self.server.refresh()}))
            return
        size = int(self.headers.get("Content-Length") or 0)
        try:
            text = json.loads(self.rfile.read(min(size, MAX_BODY)) or b"{}").get("text", "")
        except (ValueError, AttributeError):
            text = ""
        if not isinstance(text, str) or not text.strip():
            self._send(400, json.dumps({"error": "nothing to ask"}))
            return
        self.server.on_ask(text)
        self._send(200, json.dumps({"ok": True}))
