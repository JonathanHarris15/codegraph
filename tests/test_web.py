# codegraph: test module web
"""Serving a page on this machine, and hearing what the person asks from it."""
from __future__ import annotations

import json
import threading
import unittest
import urllib.error
import urllib.request

from modules.web import Server


class Served(unittest.TestCase):
    def setUp(self):
        self.asked: list = []
        self.read = 0

        def again():
            self.read += 1

        def plan(body):
            if body.get("name") == "bad":
                raise ValueError("no good")
            self.planned.append(body)
            return {"file": "plans/{}.json".format(body["name"])}

        def design(rel):
            return (b"<script>x</script>", "text/html") if rel == "plans/a/a.html" else None

        self.planned: list = []
        self.server = Server(page=lambda live: "<p>" + json.dumps(live) + "</p>",
                             on_ask=self.asked.append, on_refresh=again,
                             on_plan=plan, design=design)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def call(self, path: str, body=None, origin: str | None = None):
        url = self.server.url + path if not path.startswith("http") else path
        req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                     method="GET" if body is None else "POST")
        if origin:
            req.add_header("Origin", origin)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def test_the_page_says_where_to_send_what_is_asked(self):
        status, text = self.call("")
        self.assertEqual(status, 200)
        live = json.loads(text[3:-4])
        self.assertEqual(live["ask"], "/" + self.server.secret + "/ask")

    def test_only_the_secret_address_answers(self):
        status, _ = self.call(self.server.url.replace(self.server.secret, "guess"))
        self.assertEqual(status, 404)

    def test_what_the_page_asks_is_passed_on(self):
        status, _ = self.call("ask", {"text": "/codegraph:fix all"},
                              origin="http://localhost:{}".format(self.server.server_address[1]))
        self.assertEqual((status, self.asked), (200, ["/codegraph:fix all"]))

    def test_another_site_cannot_ask(self):
        status, _ = self.call("ask", {"text": "rm -rf"}, origin="https://evil.example")
        self.assertEqual((status, self.asked), (403, []))

    def test_an_empty_ask_is_refused(self):
        status, _ = self.call("ask", {"text": "  "})
        self.assertEqual((status, self.asked), (400, []))

    def test_a_refresh_reads_again_and_moves_the_version_on(self):
        self.assertEqual(json.loads(self.call("version")[1])["version"], 0)
        self.call("refresh", {})
        self.assertEqual((self.read, json.loads(self.call("version")[1])["version"]), (1, 1))

    def test_a_drawn_plan_is_handed_on_and_its_answer_returned(self):
        status, text = self.call("plan", {"name": "rota", "plan": {}, "designs": {}})
        self.assertEqual((status, json.loads(text)), (200, {"file": "plans/rota.json"}))
        self.assertEqual(self.planned[0]["name"], "rota")

    def test_a_plan_refused_says_why(self):
        status, text = self.call("plan", {"name": "bad"})
        self.assertEqual((status, json.loads(text)["error"]), (400, "no good"))

    def test_another_site_cannot_write_a_plan(self):
        status, _ = self.call("plan", {"name": "rota"}, origin="https://evil.example")
        self.assertEqual((status, self.planned), (403, []))

    def test_a_design_is_served_boxed_in(self):
        url = self.server.url + "design/plans/a/a.html"
        with urllib.request.urlopen(url, timeout=5) as r:
            self.assertEqual(r.read(), b"<script>x</script>")
            self.assertEqual(r.headers["Content-Security-Policy"], "sandbox")
            self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.call("design/plans/b.png")[0], 404)

