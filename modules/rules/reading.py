# codegraph: module rules
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from modules import shapes
from modules.source import KINDS, SKIP_DIRS, files_in, reader_of, text_of
from modules.tags import file_tags
from .fakes import fakes
from .layers import relation
from .pages import page_links, route_matches, route_of
from .stores import store_calls


@dataclass(frozen=True, order=True)
class Finding:
    rel: str
    line: int
    text: str

    def __str__(self) -> str:
        return (self.rel + (":" + str(self.line) if self.line else "")
                + "  " + self.text)


@dataclass
class Report:
    mismatches: list
    unknown: list


@dataclass
class Unit:
    """A module, feature, page or component, or the design system: the files
    whose tags name it, and what those tags say about it."""
    id: str
    kind: str
    name: str
    files: list = field(default_factory=list)
    door: set | None = None
    door_at: list = field(default_factory=list)
    system: str = ""
    uses: set = field(default_factory=set)
    reads: set = field(default_factory=set)
    schedules: list = field(default_factory=list)
    events: list = field(default_factory=list)
    route: str = ""
    start: bool = False

    @property
    def label(self) -> str:
        return "the design system" if self.kind == "design" else \
            "{} {}".format(self.kind, self.name)


@dataclass(frozen=True)
class Crossing:
    """One name one module takes from another."""
    src: str             # dotted name of the file that uses it
    dst: str             # dotted name of the file it comes from
    there: str           # the unit it comes from
    name: str
    ok: bool             # on that module's front door


@dataclass
class Reading:
    """The code, read against its tags. The check and the page's map views
    both start here, so they cannot disagree."""
    files: list
    tags: dict           # file -> Tag
    owner: dict          # file -> unit id
    units: dict          # unit id -> Unit
    tests: set
    mismatches: list
    unknown: list
    crossings: list
    bad: dict            # (unit, unit) -> the rules an import between them breaks
    wires: list          # (from, to, kind): writes, reads, starts and leads
    stores: dict         # store -> {"owner", "readers", "schema", "rel"}
    triggers: list       # schedules and events, each a card of its own


def _sorted(findings: list) -> list:
    return sorted(set(findings))


def read_map(root: Path, hidden: bool = False, drafted: dict | None = None) -> Reading:
    """Read the code against its tags, every rule in CONTEXT.md at once.

    `drafted` stands in for the tags of files that have none, by path: how
    the page draws a codebase nobody has tagged yet.
    """
    files = files_in(root, hidden)
    index = {f.name: f for f in files}
    mis: list = []
    unk: list = []
    tags: dict = {}
    owner: dict = {}
    units: dict = {}
    store_tags: list = []

    # ---- what each file says it is
    for f in files:
        t = file_tags(f)
        if t is None and drafted:
            t = drafted.get(f.rel)
        if t is None:
            mis.append(Finding(f.rel, 0, "has no codegraph tag saying what it belongs to"))
            continue
        mis += [Finding(f.rel, line, text) for line, text in t.errors]
        if not t.kind:
            continue
        tags[f.name] = t
        u = units.setdefault(t.unit, Unit(t.unit, t.kind, t.name))
        u.files.append(f.name)
        owner[f.name] = u.id
        if t.door is not None:
            u.door = (u.door or set()) | set(t.door)
            u.door_at.append(f.rel)
        if t.system:
            if u.system and u.system != t.system:
                mis.append(Finding(f.rel, t.line, "puts {} in system {}, but another of its "
                                   "files says {}".format(u.label, t.system, u.system)))
            u.system = u.system or t.system
        if t.route:
            u.route = u.route or t.route
        u.uses |= set(t.uses)
        u.reads |= set(t.reads)
        u.schedules += t.schedules
        u.events += t.events
        u.start |= t.start
        store_tags += [(s, schema, f, line, u.id) for s, schema, line in t.stores]

    tests = {n for n, t in tags.items() if t.kind == "test"}

    def first(u: Unit) -> str:
        return index[u.files[0]].rel

    # ---- what each unit says about itself
    for u in units.values():
        if u.kind == "module":
            if not u.door_at:
                mis.append(Finding(first(u), 0, "{} has no front door: add `codegraph: front "
                                   "door <names>` to one of its files".format(u.label)))
            for rel in u.door_at[1:]:
                mis.append(Finding(rel, 0, "{} has its front door written in more than one "
                                   "file; keep it on one".format(u.label)))
        if u.kind == "feature":
            if not u.system:
                mis.append(Finding(first(u), 0, "{} names no system: write `feature {} in "
                                   "<system>`".format(u.label, u.name)))
            for m in sorted(u.uses):
                if "module:" + m not in units:
                    mis.append(Finding(first(u), 0, "{} uses {}, which is not a module"
                                       .format(u.label, m)))

    # ---- stores, and the shapes their schemas give them
    schemas: list = []
    for f in files:
        schemas += shapes.schemas_in(f.rel, text_of(f))
    for p in shapes.schema_files(root, SKIP_DIRS):
        rel = p.relative_to(root).as_posix()
        schemas += shapes.schemas_in(rel, p.read_text(encoding="utf-8", errors="replace"))

    stores: dict = {}
    for s, schema, f, line, uid in store_tags:
        if s in stores:
            mis.append(Finding(f.rel, line, "store {} is owned by {} and {}; a store has one "
                               "owning module".format(s, units[stores[s]["owner"]].label,
                                                      units[uid].label)))
            continue
        found = shapes.find(schemas, schema or s, near=f.rel, exact=bool(schema))
        if not found:
            mis.append(Finding(f.rel, line, "store {} {}".format(s, (
                "names the schema {}, which codegraph cannot find".format(schema) if schema
                else "has no schema codegraph can read; add one the module checks its "
                     "data against"))))
        stores[s] = {"owner": uid, "readers": set(), "schema": found, "rel": f.rel}
    for u in units.values():
        for r in sorted(u.reads):
            if r in stores:
                stores[r]["readers"].add(u.id)
            else:
                mis.append(Finding(first(u), 0, "{} reads store {}, which no module owns"
                                   .format(u.label, r)))
    lower = {s.lower(): s for s in stores}

    # ---- the code itself, file by file
    crossings: list = []
    bad: dict = defaultdict(list)
    acted: set = set()
    contains: dict = defaultdict(set)
    used: dict = defaultdict(set)
    links: dict = defaultdict(set)
    built_links = False
    for f in files:
        here = owner.get(f.name)
        if here is None:
            continue
        me, kind, text = units[here], units[here].kind, text_of(f)
        reader = reader_of(f)
        uses = reader.uses(f, index)
        line_of: dict = {}
        for u in uses:
            line_of.setdefault(u.target, u.line)
        targets = dict.fromkeys(l.target for l in reader.links(f, index) if l.target)

        for tgt in targets:
            there = owner.get(tgt)
            if there is None or there == here:
                continue
            them = units[there]
            wire, wrong = relation(kind, them.kind)
            line = line_of.get(tgt, 0)
            if wrong:
                mis.append(Finding(f.rel, line, "imports {} from {}: {}".format(
                    index[tgt].rel, them.label, wrong)))
                bad[(here, there)].append(wrong)
            if wire == "acts":
                acted.add(there)
            elif wire == "contains":
                contains[here].add(there)
            elif wire == "uses":
                used[here].add(them.name)
                if them.name not in me.uses:
                    wrong = "uses {} without saying so; add it to `uses`".format(them.label)
                    mis.append(Finding(f.rel, line, "{} {}".format(me.label, wrong)))
                    bad[(here, there)].append(wrong)

        for u in uses:
            there = owner.get(u.target)
            if there is None or there == here or kind == "tooling" or \
                    units[there].kind != "module":
                continue
            if u.name is None:
                unk.append(Finding(f.rel, u.line, "uses {} in a way that cannot be read ({})"
                                   .format(units[there].label, u.why)))
                continue
            ok = u.name in (units[there].door or set())
            crossings.append(Crossing(f.name, u.target, there, u.name, ok))
            if not ok:
                mis.append(Finding(f.rel, u.line, "uses {} from {}, which is not on its front "
                                   "door".format(u.name, units[there].label)))

        if kind in ("test", "tooling"):
            if kind == "test":
                for what, line in fakes(f, text, index):
                    mis.append(Finding(f.rel, line, "fakes {}, code in the repo; a test fakes "
                                       "only outside connections".format(what)))
            continue

        if kind != "module":
            for conn in reader.outside(f):
                if conn.kind != "serves":
                    mis.append(Finding(f.rel, 0, "reaches {} ({}); only a module reaches an "
                                       "outside connection".format(conn.label,
                                                                   KINDS[conn.kind]["label"])))

        for name, how, line in store_calls(text):
            s = lower.get(name.lower())
            if s is None:
                mis.append(Finding(f.rel, line, "reaches {}, which is not a declared store; tag "
                                   "its schema in the module that owns it with `codegraph: "
                                   "store {}`".format(name, name)))
            elif kind != "module":
                mis.append(Finding(f.rel, line, "reaches store {} directly; only a module reaches "
                                   "a store, so go through {}".format(
                                       s, units[stores[s]["owner"]].label)))
            elif here == stores[s]["owner"]:
                continue
            elif how == "writes":
                mis.append(Finding(f.rel, line, "writes store {}, which {} owns; only its owner "
                                   "writes".format(s, units[stores[s]["owner"]].label)))
            elif here not in stores[s]["readers"]:
                mis.append(Finding(f.rel, line, "reads store {} without saying so; add `codegraph: "
                                   "reads {}`, or go through {}".format(
                                       s, s, units[stores[s]["owner"]].label)))

        if kind in ("page", "component"):
            for link, line in page_links(text):
                if link is None:
                    built_links = True
                    unk.append(Finding(f.rel, line, "builds a link while it runs; where it "
                                       "leads cannot be told"))
                else:
                    links[here].add((link, f.rel, line))

    # ---- features: what they said they use, and what starts them
    triggers: list = []
    for u in units.values():
        if u.kind != "feature":
            continue
        for m in sorted(u.uses - used[u.id]):
            if "module:" + m in units:
                mis.append(Finding(first(u), 0, "{} says it uses module {} but never does"
                                   .format(u.label, m)))
        if not (u.schedules or u.events or u.id in acted):
            mis.append(Finding(first(u), 0, "{} has no trigger: no page acts on it, and it "
                               "has no schedule or event".format(u.label)))
        for i, timing in enumerate(u.schedules):
            triggers.append({"id": "trigger:{}:{}".format(u.id, i), "kind": "schedule",
                             "label": timing, "feature": u.id, "fields": []})
        for i, (event, schema) in enumerate(u.events, start=len(u.schedules)):
            found = shapes.find(schemas, schema, near=first(u), exact=True) if schema else None
            if not schema:
                unk.append(Finding(first(u), 0, "event {} names no schema (`as <Type>`), so what "
                                   "it carries cannot be shown".format(event)))
            elif not found:
                mis.append(Finding(first(u), 0, "event {} names the schema {}, which codegraph "
                                   "cannot find".format(event, schema)))
            triggers.append({"id": "trigger:{}:{}".format(u.id, i), "kind": "event",
                             "label": event, "feature": u.id,
                             "fields": found.lines() if found else []})

    # ---- tests: what each says it tests
    walked: set = set()
    for n in sorted(tests):
        t, f = tags[n], index[n]
        if t.of in ("module", "feature"):
            target = units.get(t.of + ":" + t.name)
            if target is None:
                mis.append(Finding(f.rel, t.line, "tests {} {}, which is not a {}".format(
                    t.of, t.name, t.of)))
            elif t.of == "feature" and not {l.target for l in reader_of(f).links(f, index)} \
                    & set(target.files):
                mis.append(Finding(f.rel, t.line, "is a test of {} but never starts it".format(
                    target.label)))
        for p in t.walks:
            if "page:" + p in units:
                walked.add("page:" + p)
            else:
                mis.append(Finding(f.rel, t.line, "walks page {}, which is not a page".format(p)))

    # ---- pages: where each is, where its links lead, and who walks it
    pages = {k: u for k, u in units.items() if u.kind == "page"}
    for u in pages.values():
        u.route = u.route or next((r for r in (route_of(index[n].rel) for n in u.files) if r), "")
    leads: dict = defaultdict(set)
    for p in pages:
        seen, stack = {p}, [p]
        while stack:                       # a component's links belong to its pages
            for c in contains.get(stack.pop(), ()):
                if c not in seen:
                    seen.add(c); stack.append(c)
        for holder in seen:
            for link, rel, line in links.get(holder, ()):
                hits = [q for q, v in pages.items() if v.route and route_matches(link, v.route)]
                if not hits:
                    unk.append(Finding(rel, line, "links to {}, which no page is at".format(link)))
                leads[p] |= {q for q in hits if q != p}
    if pages:
        starts = [p for p, u in pages.items() if u.start]
        if not starts:
            mis.append(Finding(first(min(pages.values(), key=lambda u: u.id)), 0,
                               "no page is a start page: mark one `codegraph: start page <name>`"))
        reach, stack = set(starts), list(starts)
        while stack:
            for q in leads.get(stack.pop(), ()):
                if q not in reach:
                    reach.add(q); stack.append(q)
        for p in sorted(set(pages) - reach):
            if starts:
                (unk if built_links else mis).append(Finding(
                    first(pages[p]), 0, "{} cannot be reached from a start page by following "
                    "its links".format(pages[p].label)))
        for p in sorted(set(pages) - walked):
            mis.append(Finding(first(pages[p]), 0, "no UI test walks {}; name it in a test's "
                               "`codegraph: test ui` tag".format(pages[p].label)))

    wires = [(stores[s]["owner"], "store:" + s, "writes") for s in sorted(stores)]
    wires += [(r, "store:" + s, "reads") for s in sorted(stores)
              for r in sorted(stores[s]["readers"])]
    wires += [(t["id"], t["feature"], "starts") for t in triggers]
    wires += [(p, q, "leads") for p in sorted(leads) for q in sorted(leads[p])]

    return Reading(files, tags, owner, units, tests, _sorted(mis), _sorted(unk), crossings,
                   dict(bad), wires, stores, triggers)
