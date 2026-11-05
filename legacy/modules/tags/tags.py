# codegraph: module tags
from __future__ import annotations

import re
from dataclasses import dataclass, field

from modules.source import files_in


# ---------------------------------------------------------------------- tags
#
# Every source file says in a tag what it belongs to (docs/adr/0002): one
# comment line near its top that starts `codegraph:`. The tags, read
# together, are the declaration; what the code really does is read back
# against them. CONTEXT.md has the words.
#
#   # codegraph: module engine                 a file of the engine module
#   # codegraph: front door Book, tick         once per module
#   # codegraph: store members as Member       the module owns this store
#   # codegraph: shape of members              and this file prints its shape
#   # codegraph: reads services                and may read this one
#   // codegraph: feature plan-service in calendar
#   // codegraph: uses services, members
#   // codegraph: schedule every day at 08:00
#   // codegraph: event stripe-paid as PaidEvent
#   # codegraph: command import-sales          a person runs it at a terminal
#   // codegraph: page members at /members     or: start page home at /
#   // codegraph: component people-picker
#   // codegraph: design system
#   // codegraph: shell                        the frame every page is drawn in
#   # codegraph: test module engine            or: test feature X, test ui home, members
#   // codegraph: fakes ./render because jsdom has no canvas
#   # codegraph: tooling

TAG_LINES = 30                     # a tag sits in a file's first lines

TAG_RE = re.compile(r"^\s*(?:#|//|/\*+|\*|--|<!--)\s*codegraph:\s*(.*?)\s*(?:\*/|-->)?\s*$")
QUOTES = re.compile(r'"""|' + r"'''")
NAME = r"([\w.\-/@]+)"
KINDS_OF_FILE = ("module", "feature", "page", "component", "design", "shell", "test",
                 "tooling")
STATEMENTS = (
    # (pattern, what it says, the kinds of file that may say it)
    (re.compile(r"module " + NAME + r"$"), "module", None),
    (re.compile(r"feature " + NAME + r"(?: in " + NAME + r")?$"), "feature", None),
    (re.compile(r"(start )?page " + NAME + r"(?: at (\S+))?$"), "page", None),
    (re.compile(r"component " + NAME + r"$"), "component", None),
    (re.compile(r"design system$"), "design", None),
    (re.compile(r"shell$"), "shell", None),
    (re.compile(r"test (module|feature) " + NAME + r"$"), "test", None),
    (re.compile(r"test (ui)(?: (.+))?$"), "test", None),
    (re.compile(r"tooling$"), "tooling", None),
    (re.compile(r"front door\s*(.*)$"), "door", "module"),
    (re.compile(r"store " + NAME + r"(?: as " + NAME + r")?$"), "store", "module"),
    (re.compile(r"shape of " + NAME + r"$"), "shape", "module"),
    (re.compile(r"reads (.+)$"), "reads", "module"),
    (re.compile(r"uses (.+)$"), "uses", "feature"),
    (re.compile(r"schedule (.+)$"), "schedule", "feature"),
    (re.compile(r"event " + NAME + r"(?: as " + NAME + r")?$"), "event", "feature"),
    (re.compile(r"command " + NAME + r"$"), "command", "feature"),
    (re.compile(r"fakes (.+?)(?: because (.+))?$"), "fakes", "test"),
)


def _names(text: str) -> list:
    return [n.strip() for n in text.split(",") if n.strip() and n.strip() != "none"]


@dataclass
class Tag:
    """What one file's tags say."""
    kind: str = ""
    name: str = ""
    line: int = 0
    system: str = ""
    door: list | None = None          # a module's front door, on one of its files
    stores: list = field(default_factory=list)     # [(store, schema or "", line)]
    shapes: list = field(default_factory=list)     # [(store, line)] this file prints
    reads: list = field(default_factory=list)
    uses: list = field(default_factory=list)
    schedules: list = field(default_factory=list)
    events: list = field(default_factory=list)     # [(event, schema or "")]
    commands: list = field(default_factory=list)   # what a person types to start it
    route: str = ""
    start: bool = False
    of: str = ""                      # a test's kind: module, feature or ui
    walks: list = field(default_factory=list)      # the pages a UI test walks
    fakes: list = field(default_factory=list)      # [(what, line)] it fakes, and has said why
    errors: list = field(default_factory=list)     # [(line, text)]

    @property
    def unit(self) -> str:
        if self.kind in ("module", "feature", "page", "component"):
            return self.kind + ":" + self.name
        return self.kind


def read_tags(text: str) -> Tag | None:
    """The tags in a file's first lines, or None when it has none."""
    tag, seen, said = Tag(), False, []
    quote = None                    # the """ or ''' a line starts inside, if any
    for no, line in enumerate(text.splitlines()[:TAG_LINES], start=1):
        inside = quote
        for q in QUOTES.findall(line):
            quote = None if q == quote else quote or q
        # a docstring that shows a tag, to explain tags, is not one
        m = None if inside else TAG_RE.match(line)
        if not m:
            continue
        seen, stmt = True, m.group(1)
        for pattern, what, only in STATEMENTS:
            hit = pattern.match(stmt)
            if hit:
                break
        else:
            tag.errors.append((no, "cannot read the tag `codegraph: {}`".format(stmt)))
            continue
        if only is None:                                   # says what the file is
            if tag.kind:
                tag.errors.append((no, "has two tags saying what it is: {} and {}"
                                   .format(tag.kind, what)))
                continue
            tag.kind, tag.line = what, no
            g = hit.groups()
            if what == "feature":
                tag.name, tag.system = g[0], g[1] or ""
            elif what == "page":
                tag.start, tag.name, tag.route = bool(g[0]), g[1], g[2] or ""
            elif what == "test":
                tag.of = g[0]
                tag.name = g[1] if g[0] != "ui" else ""
                tag.walks = _names(g[1] or "") if g[0] == "ui" else []
            elif what in ("module", "component"):
                tag.name = g[0]
            continue
        g = hit.groups()
        if what == "door":
            tag.door = (tag.door or []) + _names(g[0])
        elif what == "store":
            tag.stores.append((g[0], g[1] or "", no))
        elif what == "shape":
            tag.shapes.append((g[0], no))
        elif what == "reads":
            tag.reads += _names(g[0])
        elif what == "uses":
            tag.uses += _names(g[0])
        elif what == "schedule":
            tag.schedules.append(g[0])
        elif what == "event":
            tag.events.append((g[0], g[1] or ""))
        elif what == "command":
            tag.commands.append(g[0])
        elif what == "fakes":
            if not g[1]:
                tag.errors.append((no, "says it fakes {} but not why: write `fakes {} because "
                                   "<what the test runtime lacks>`".format(g[0], g[0])))
            tag.fakes += [(n, no) for n in _names(g[0])]
        said.append((no, what, only))
    if not seen:
        return None
    for no, what, only in said:
        if tag.kind != only:
            tag.errors.append((no, "a {} tag cannot say `{}`; only a {} can".format(
                tag.kind or "file with no kind", what.replace("door", "front door"), only)))
    if not tag.kind and not tag.errors:
        tag.errors.append((1, "has tags but none says what the file is"))
    return tag


def file_tags(f: File) -> Tag | None:
    try:
        with open(f.path, encoding="utf-8", errors="replace") as fh:
            head = "".join(next(fh, "") for _ in range(TAG_LINES))
    except OSError:
        return None
    return read_tags(head)


def insert_tags(text: str, lines: list, comment: str) -> str:
    """Put tag lines at the top of a file's text: after a #! line, a Python
    coding line, or the "use client" a framework needs first."""
    nl = "\r\n" if "\r\n" in text else "\n"
    rows = text.splitlines(keepends=True)
    i = 1 if rows and rows[0].startswith("#!") else 0
    if comment == "#" and i < len(rows) and re.match(r"#.*coding[:=]", rows[i]):
        i += 1
    while comment == "//" and i < len(rows) and \
            re.match(r"""\s*(["'])use (client|server|strict)\1;?\s*$""", rows[i]):
        i += 1
    block = "".join("{} codegraph: {}{}".format(comment, l, nl) for l in lines)
    return "".join(rows[:i]) + block + "".join(rows[i:])


def tagged_at_all(root: Path, hidden: bool = False) -> bool:
    return any(file_tags(f) is not None for f in files_in(root, hidden))
