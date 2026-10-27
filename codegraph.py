#!/usr/bin/env python3
# codegraph: start page command-line
"""codegraph - turn a Python codebase into a card-and-wire graph.

Point it at a folder. It parses every .py file with the ast module, works out
which imports land back inside that folder, and writes a standalone HTML page
you can open in a browser. No third-party packages, no model in the loop.

    python codegraph.py ../..                  # -> codegraph.html
    python codegraph.py ../.. -o graph.html
    python codegraph.py ../.. --json           # the data, nothing else
    python codegraph.py ../.. --externals      # third-party packages as cards too
    python codegraph.py ../.. --draft          # declare modules and front doors
    python codegraph.py ../.. --check          # read the code against them

What it knows how to see:

    import a.b            module-level import        -> kind "import"
    from .x import y      relative import, resolved  -> kind "import"
    def f(): import a.b   import inside a function   -> kind "lazy"

Anything the resolver cannot place inside the folder is third-party or standard
library. Standard library is dropped; third-party becomes a card only with
--externals.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from features.check import check
from features.draft import draft
from features.map import draw_map
from modules.drawing import nodes_by_id, render, summary
from modules.source import KINDS


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="codegraph",
        description="Draw a codebase as modules, features and UI, and check it against its tags.",
    )
    ap.add_argument("root", type=Path, help="folder to read")
    ap.add_argument("-o", "--out", type=Path, default=Path("codegraph.html"),
                    help="where to write the page (default: codegraph.html)")
    ap.add_argument("--json", action="store_true", help="print the data, write no page")
    ap.add_argument("--externals", action="store_true",
                    help="give third-party packages their own cards")
    ap.add_argument("--hidden", action="store_true",
                    help="read dotted folders too (.claude, .github ...)")
    ap.add_argument("--no-outside", dest="outside", action="store_false",
                    help="imports only; skip the hunt for outside connections")
    ap.add_argument("--layout", choices=("file", "folder"), default="file",
                    help="columns by import depth (default) or one per folder")
    ap.add_argument("--keep-empty", action="store_true",
                    help="keep empty __init__.py files that nothing imports")
    ap.add_argument("--check", action="store_true",
                    help="read the code against its tags; exit 1 on a mismatch")
    ap.add_argument("--draft", action="store_true",
                    help="write a first tag into every file that has none")
    ap.add_argument("--summary", action="store_true",
                    help="print what the mod beside the chat shows, as JSON")
    args = ap.parse_args(argv)

    root = args.root.resolve()
    if not root.is_dir():
        ap.error(str(root) + " is not a folder")

    if args.draft:
        drafts, seeded = draft(root, hidden=args.hidden)
        counts: dict = defaultdict(int)
        for lines in drafts.values():
            counts[lines[0].split()[0] if not lines[0].startswith("start") else "page"] += 1
        print("tagged {} files: {}".format(len(drafts), ", ".join(
            "{} {}".format(n, k) for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))))
        print("Every front door holds what crosses today. Narrow each to what should "
              "cross, correct any guess, then run --check.")
        if seeded:
            print("codegraph.json seeded the modules; the tags replace it, so it can go.")
        return 0
    if args.check:
        report = check(root, hidden=args.hidden)
        for m in report.mismatches:
            print(m)
        if report.unknown:
            print("cannot tell:")
            for u in report.unknown:
                print("    " + str(u))
        print("{} mismatches, {} cannot tell".format(
            len(report.mismatches), len(report.unknown)))
        return 1 if report.mismatches else 0

    graph = draw_map(root, externals=args.externals, hidden=args.hidden,
                     outside=args.outside, layout=args.layout, keep_empty=args.keep_empty)
    source = graph["map"]["source"]

    if args.summary:
        print(json.dumps(summary(graph)))
        return 0
    if args.json:
        print(json.dumps(graph, indent=2))
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(graph), encoding="utf-8")

    nfiles = sum(1 for n in graph["nodes"] if n["kind"] == "file")
    lazy = sum(1 for e in graph["edges"] if e["kind"] == "lazy")
    print(
        "{} files, {} wires ({} of them imports inside a function), "
        "{} folders -> {}".format(
            nfiles, len(graph["edges"]), lazy, len(graph["groups"]), args.out
        )
    )
    if args.layout == "file":
        cols = [n["col"] for n in graph["nodes"] if n["kind"] == "file"] or [0]
        deep = max(cols) - min(cols)
        back = sum(1 for e in graph["edges"]
                   if e["kind"] in ("import", "lazy")
                   and nodes_by_id(graph)[e["to"]]["col"]
                   >= nodes_by_id(graph)[e["from"]]["col"])
        print("{} columns deep{}".format(
            deep + 1,
            "" if not back else "; {} wires point back (a loop)".format(back)))

    outs = [n for n in graph["nodes"] if n["kind"] == "outside"]
    if outs:
        by_kind: dict = defaultdict(set)
        for e in graph["edges"]:
            if e["kind"] in KINDS and e["kind"] not in ("import", "lazy"):
                by_kind[e["kind"]].add(e["to"])
        print("reaches outside: " + ", ".join(
            "{} {}".format(len(v), KINDS[k]["label"]) for k, v in
            sorted(by_kind.items(), key=lambda kv: -len(kv[1]))
        ))
        for n in sorted(outs, key=lambda n: n["label"]):
            print("    {:<26} {}".format(n["label"], n["dir"]))

    mv = graph["map"]
    kinds = defaultdict(int)
    for n in mv["views"]["map"]["nodes"]:
        kinds[n["kind"]] += 1
    print("{} ({}): {} mismatches, {} cannot tell".format(
        ", ".join("{} {}".format(kinds[k], k) for k in
                  ("module", "feature", "page", "component", "store") if kinds[k]) or "nothing",
        "read from tags" if source == "tags" else "drafted, nothing tagged yet",
        len(mv["mismatches"]), len(mv["unknown"])))

    seen = list(graph["externals_seen"])[:6]
    if seen:
        more = "" if args.externals else "   (--externals draws these too)"
        print("third party seen: " + ", ".join(seen) + more)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
