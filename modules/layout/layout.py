# codegraph: module layout
from __future__ import annotations

import math
from collections import defaultdict, deque


def order_groups(files: list, edges: dict, tail: list) -> list[str]:
    """Left to right: whoever imports comes before whoever is imported.

    A topological sort of the folders. Cycles get broken by taking the folder
    with the fewest unmet dependents, then by name, so the result is stable.
    """
    group_of = {m.name: m.group for m in files}
    groups = sorted({m.group for m in files})

    deps: dict = {g: set() for g in groups}          # g imports these folders
    for (src, dst) in edges:
        a, b = group_of.get(src), group_of.get(dst)
        if a and b and a != b:
            deps[a].add(b)

    indeg = {g: 0 for g in groups}
    for g, ds in deps.items():
        for d in ds:
            indeg[d] += 1

    order: list[str] = []
    left = set(groups)
    while left:
        ready = sorted(g for g in left if indeg[g] == 0)
        if not ready:                                # a cycle; break it cheaply
            ready = [min(left, key=lambda g: (indeg[g], g))]
        for g in ready:
            if g not in left:
                continue
            order.append(g)
            left.discard(g)
            for d in deps[g]:
                if d in left:
                    indeg[d] -= 1

    return order + list(tail)


# -------------------------------------------------------------------- layout

MAXROWS = 12          # before a folder column splits in two (folder layout only)


def back_edges(ids: list, pairs: list) -> set:
    """The edges that close a loop, found by one depth-first walk.

    Dropping them leaves a graph with no cycles, which is all the layering
    needs. Iterative, so a deep codebase cannot blow the stack.
    """
    adj: dict = defaultdict(list)
    for src, dst in pairs:
        adj[src].append(dst)

    WHITE, GREY, BLACK = 0, 1, 2
    colour = {i: WHITE for i in ids}
    back: set = set()

    for root in ids:
        if colour[root] != WHITE:
            continue
        colour[root] = GREY
        stack = [(root, iter(adj[root]))]
        while stack:
            node, rest = stack[-1]
            went_deeper = False
            for nxt in rest:
                if nxt not in colour:
                    continue
                if colour[nxt] == GREY:
                    back.add((node, nxt))        # points back at an open node
                elif colour[nxt] == WHITE:
                    colour[nxt] = GREY
                    stack.append((nxt, iter(adj[nxt])))
                    went_deeper = True
                    break
            if not went_deeper:
                colour[node] = BLACK
                stack.pop()
    return back


def layer(ids: list, pairs: list) -> dict:
    """Give every file a column: one past the furthest thing that imports it.

    A file nothing imports starts at 0, so entry points line up on the left
    and every import wire then points rightward.
    """
    loops = back_edges(ids, pairs)
    alive = [(s, d) for s, d in pairs
             if (s, d) not in loops and s in set(ids) and d in set(ids)]

    nxt: dict = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for src, dst in alive:
        nxt[src].append(dst)
        indeg[dst] += 1

    col = {i: 0 for i in ids}
    queue = deque(i for i in ids if indeg[i] == 0)
    while queue:
        node = queue.popleft()
        for dst in nxt[node]:
            col[dst] = max(col[dst], col[node] + 1)
            indeg[dst] -= 1
            if indeg[dst] == 0:
                queue.append(dst)
    return col


def order_rows(columns: dict, pairs: list, sweeps: int = 4) -> dict:
    """Shuffle each column so the wires between them cross less.

    The usual barycentre heuristic: put a card level with the average of the
    cards it is wired to, one column at a time, back and forth.
    """
    before: dict = defaultdict(list)
    after: dict = defaultdict(list)
    for src, dst in pairs:
        after[src].append(dst)
        before[dst].append(src)

    tallest = max((len(v) for v in columns.values()), default=1)
    place: dict = {}

    def restack() -> None:
        for col, names in columns.items():
            pad = (tallest - len(names)) / 2.0      # columns sit centred
            for row, name in enumerate(names):
                place[name] = pad + row

    restack()
    keys = sorted(columns)
    for sweep in range(sweeps):
        run = keys[1:] if sweep % 2 == 0 else list(reversed(keys[:-1]))
        side = before if sweep % 2 == 0 else after
        for col in run:
            columns[col].sort(key=lambda n: (
                sum(place[m] for m in side[n] if m in place) / len(
                    [m for m in side[n] if m in place])
                if any(m in place for m in side[n]) else place[n]
            ))
            restack()

    return {n: row for col in columns for row, n in enumerate(columns[col])}


def place_by_file(nodes: list, pairs: list, pinned: list) -> tuple:
    """Lay out one card per file, by how deep in the import chain it sits."""
    loose = [n["id"] for n in nodes if n["group"] not in pinned]
    inner = [(s, d) for s, d in pairs if s in set(loose) and d in set(loose)]

    col = layer(loose, inner)
    depth = max(col.values(), default=0)

    # the cards that are not files go in columns of their own, at the end
    labels: dict = {}
    for extra, group in enumerate(pinned, start=1):
        for n in nodes:
            if n["group"] == group:
                col[n["id"]] = depth + extra
        labels[depth + extra] = group.strip("()")

    columns: dict = defaultdict(list)
    for n in nodes:
        columns[col[n["id"]]].append(n["id"])
    for c in columns:                       # a steady start for the sweeps
        order = {n["id"]: (n["group"], n["label"]) for n in nodes}
        columns[c].sort(key=lambda n: order[n])

    row = order_rows(columns, pairs)
    return mirror(col, row, [{"label": labels.get(c, "")} for c in sorted(columns)])


def mirror(col: dict, row: dict, labels: list) -> tuple:
    """Flip the columns end to end.

    The page draws a wire as flowing from what is imported into what imports
    it, so what is imported has to sit on the left for the wires to run
    rightward. Outside connections, where data comes from, end up first.
    """
    last = len(labels) - 1
    return {k: last - c for k, c in col.items()}, row, labels[::-1]


def place_inside(nodes: list, pairs: list, own: set, pinned: list) -> tuple:
    """Lay out the view inside one module so its own files sit in one block.

    Left to right: outside connections, the modules it uses, its own files by
    import depth, then the modules that use it. Every wire crossing the edge
    of the block is then another module coming in or going out. A module that
    does both goes on the side with more wires.
    """
    mine = [n["id"] for n in nodes if n["id"] in own]
    depth = layer(mine, [(s, d) for s, d in pairs if s in own and d in own])
    deepest = max(depth.values(), default=0)

    left, right = [], []
    for n in nodes:
        if n["id"] in own or n["group"] in pinned:
            continue
        uses = sum(1 for s, d in pairs if s in own and d == n["id"])
        used = sum(1 for s, d in pairs if d in own and s == n["id"])
        (right if used > uses else left).append(n["id"])

    col: dict = {}
    labels: list = []
    for group in pinned:
        for n in nodes:
            if n["group"] == group:
                col[n["id"]] = len(labels)
        labels.append(group.strip("()"))
    if left:
        col.update({i: len(labels) for i in left})
        labels.append("uses")
    for i in mine:
        col[i] = len(labels) + deepest - depth[i]      # imported on the left
    labels += [""] * (deepest + 1) if mine else []
    if right:
        col.update({i: len(labels) for i in right})
        labels.append("used by")

    columns: dict = defaultdict(list)
    order = {n["id"]: (n["group"], n["label"]) for n in nodes}
    for n in nodes:
        columns[col[n["id"]]].append(n["id"])
    for c in columns:
        columns[c].sort(key=lambda i: order[i])
    return col, order_rows(columns, pairs), [{"label": l} for l in labels]


# The map's blocks, as in the drawing it copies: (block, label, kinds, tier,
# beside). Tier 0 sits above the middle row, 2 below it; a block off the
# middle row shares the columns of the block it is `beside`, each card over
# or under the cards it is wired to there.
MAP_BLOCKS = (
    ("reach", "outside + stores", ("outside", "store"), 0, "modules"),
    ("modules", "modules", ("module",), 1, ""),
    ("starts", "triggers", ("trigger",), 0, "features"),
    ("features", "features", ("feature",), 1, ""),
    ("pages", "pages", ("page",), 1, ""),
    ("kit", "design system + components", ("component",), 2, "pages"),
)
CELL = 3.8            # a column is this many cards tall in width, cards and gaps
SYSTEM_GAP = 0.8      # room under a system's box for the next one's name, in cards


def size_cards(nodes: list) -> None:
    """Give each card a `size`: how big it draws beside the others in view,
    by the square root of its lines over the middle card's, from 0.9 to 2.
    A card with no lines of its own, a store or a trigger, is 1."""
    lines = sorted(n["lines"] for n in nodes if n.get("lines"))
    mid = lines[len(lines) // 2] if lines else 0
    for n in nodes:
        n["size"] = (round(min(2.0, max(0.9, math.sqrt(n["lines"] / mid))), 2)
                     if mid and n.get("lines") else 1)


def _weight(n: dict) -> float:
    """How tall a card draws, in cards: as big as its size, or its list of files."""
    files = len(n.get("files") or ())
    return max(1.2 + files / 5 if files else 1, n.get("size", 1))


def _split(weights: list, k: int) -> list:
    """Cut a run into k columns of about the same height, keeping its order:
    the column each card lands in."""
    total, out, c, run = sum(weights), [], 0, 0.0
    for i, w in enumerate(weights):
        left = len(weights) - i
        if c < k - 1 and run > 0 and (run + w / 2 > total * (c + 1) / k or left <= k - 1 - c):
            c += 1
        out.append(c)
        run += w
    return out


def _tall(weights: list, k: int) -> float:
    per = defaultdict(float)
    for c, w in zip(_split(weights, k), weights):
        per[c] += w
    return max(per.values(), default=0.0)


def hops(pages: list, leads: list, starts: list) -> dict:
    """How many links it takes to reach each page from a start page. With no
    start page, every page no other page links to is one. A page no link
    reaches comes one past the furthest."""
    nxt: dict = defaultdict(list)
    for src, dst in leads:
        nxt[src].append(dst)
    roots = starts or [p for p in pages if not any(d == p and s != p for s, d in leads)] \
        or sorted(pages)[:1]
    far = {p: 0 for p in roots}
    queue = deque(roots)
    while queue:
        p = queue.popleft()
        for q in nxt[p]:
            if q in far or q not in pages:
                continue
            far[q] = far[p] + 1
            queue.append(q)
    past = max(far.values(), default=-1) + 1
    return {p: far.get(p, past) for p in pages}


def place_map(nodes: list, pairs: list, leads: list = (), aspect: float = 1.0) -> tuple:
    """Lay out the map in blocks: modules on the left with the outside
    connections and stores they reach above them, features in the middle in
    their systems with their triggers above, and pages on the right with the
    design system and components below. The start page leads the pages, and
    each page sits as many columns right as the fewest `leads`, links between
    pages, it takes to get there. Modules and systems wrap into as many
    columns as bring the whole map nearest `aspect`, wide over tall; what
    sits above or below a block sits by the cards it is wired to.

    Returns (col, row, columns, blocks): a card's column on the grid and its
    row within that column and tier, and each block's cards and tier. A
    system's block says it is `within` features."""
    of = {"external": "outside", "design": "component", "loose": "page"}
    kinds = {n["id"]: of.get(n["kind"], n["kind"]) for n in nodes}
    block_of = {k: b for b, _, ks, _, _ in MAP_BLOCKS for k in ks}
    for i, k in kinds.items():                       # anything else, with the pages
        kinds[i] = k if k in block_of else "page"
    by_id = {n["id"]: n for n in nodes}

    # the order within each block: modules used on the left, then wires untangled
    mods = [i for i, k in kinds.items() if k == "module"]
    depth = layer(mods, [(s, d) for s, d in pairs if s in set(mods) and d in set(mods)])
    deepest = max(depth.values(), default=0)
    pages = [i for i, k in kinds.items() if k == "page"]
    far = hops(pages, leads, [i for i in pages if by_id[i].get("start")])
    band = {i: deepest - depth[i] if kinds[i] == "module" else far.get(i, 0) for i in kinds}
    columns: dict = defaultdict(list)
    for i in kinds:
        columns[(block_of[kinds[i]], band[i])].append(i)
    order = {n["id"]: (n["group"], n["label"]) for n in nodes}
    for c in columns.values():
        c.sort(key=lambda i: order[i])
    keys = sorted(columns, key=lambda k: ([b for b, *_ in MAP_BLOCKS].index(k[0]), k[1]))
    rows = order_rows({j: columns[k] for j, k in enumerate(keys)}, list(pairs) + list(leads))
    run: dict = defaultdict(list)
    for k in keys:
        run[k[0]] += sorted(columns[k], key=lambda i: rows[i])

    # what stacks together: a system's features, else each card on its own
    groups: dict = defaultdict(list, {b: [[i] for i in run[b]] for b in run})
    systems: dict = defaultdict(list)
    for i in run["features"]:
        systems[by_id[i]["group"]].append(i)
    groups["features"] = sorted(systems.values(),
                                key=lambda g: sum(run["features"].index(i) for i in g) / len(g))

    def weights(b: str) -> list:
        gap = SYSTEM_GAP if b == "features" else 0
        return [sum(_weight(by_id[i]) for i in g) + gap for g in groups[b]]

    def wide(b: str) -> float:
        """How wide one of a block's columns draws, as its biggest card."""
        biggest = max([by_id[i].get("size", 1) for i in run[b]], default=1)
        return CELL * (0.4 + 0.6 * biggest)

    def tall(b: str, k: int) -> float:
        """How tall a middle block draws in k columns; the pages keep theirs."""
        if b != "pages":
            return _tall(weights(b), k)
        per: dict = defaultdict(float)
        for i in run[b]:
            per[far[i]] += _weight(by_id[i])
        return max(per.values(), default=0.0)

    def shape(k: dict) -> tuple:
        """How wide and tall the map draws with k columns per block."""
        top = max([-(-len(run[b]) // k[beside]) for b, _, _, t, beside in MAP_BLOCKS
                   if t == 0 and run[b]], default=0)
        mid = {b: tall(b, k[b]) for b, _, _, t, _ in MAP_BLOCKS if t == 1}
        for b, _, _, t, beside in MAP_BLOCKS:        # hangs just under its block
            if t == 2 and run[b]:
                mid[beside] += 0.5 + _tall(weights(b), k[beside])
        return (sum(n * wide(b) for b, n in k.items()),
                top + max(mid.values(), default=0) + 0.5 * (top > 0))

    def fits(k: dict) -> tuple:
        """Nearest `aspect` overall, with the modules and features blocks
        about as tall as each other, as the drawing has them."""
        w, h = shape(k)
        off = abs(math.log(max(w, 1) / max(h, 1) / aspect))
        if run["modules"] and run["features"]:
            off += abs(math.log(_tall(weights("modules"), k["modules"]) /
                                _tall(weights("features"), k["features"])))
        return off, sum(k.values())

    width = {b: 1 if run[b] or any(t != 1 and beside == b and run[o]
                                   for o, _, _, t, beside in MAP_BLOCKS) else 0
             for b, _, _, t, _ in MAP_BLOCKS if t == 1}
    if pages:
        width["pages"] = max(far.values()) + 1
    best = dict(width)
    for km in range(width["modules"], len(groups["modules"]) + 1):
        for kf in range(width["features"], len(groups["features"]) + 1):
            k = dict(width, modules=km, features=kf)
            if fits(k) < fits(best):
                best = k

    first, start = {}, 0
    for b, _, _, t, _ in MAP_BLOCKS:
        if t == 1:
            first[b], start = start, start + best[b]
    col: dict = {}
    row: dict = {}
    seen: dict = defaultdict(int)

    def put(i: str, c: int, t: int) -> None:
        col[i], row[i] = c, seen[(t, c)]
        seen[(t, c)] += 1

    for b, _, _, t, _ in MAP_BLOCKS:                 # the middle row
        if t != 1 or not run[b]:
            continue
        if b == "pages":
            for i in run[b]:
                put(i, first[b] + far[i], t)
            continue
        for g, c in zip(groups[b], _split(weights(b), best[b])):
            for i in g:
                put(i, first[b] + c, t)

    def wired(i: str) -> list:
        return [o for s, d in pairs for o in ((d,) if s == i else (s,) if d == i else ())]

    for b, _, _, t, beside in MAP_BLOCKS:            # above and below: by what each is wired to
        if t == 1 or not run[b]:
            continue
        home = set(run[beside])
        span = range(first[beside], first[beside] + best[beside])
        # above, the cards share the columns out evenly; below, a component
        # stays under its pages however many others are there
        room = -(-len(run[b]) // best[beside]) if t == 0 else len(run[b])
        aim = {}
        for i in run[b]:
            near = [col[o] for o in wired(i) if o in home]
            aim[i] = sum(near) / len(near) if near else None
        for _ in run[b]:                             # wired only in its own block: go with those
            lone = {i: [aim[o] for o in wired(i) if aim.get(o) is not None]
                    for i in run[b] if aim[i] is None}
            lone = {i: near for i, near in lone.items() if near}
            if not lone:
                break
            aim.update({i: sum(near) / len(near) for i, near in lone.items()})
        held = layer(run[b], [(s, d) for s, d in pairs if s in aim and d in aim])
        for i in sorted(run[b], key=lambda i: (aim[i] is None, aim[i] or 0, held[i])):
            free = [c for c in span if seen[(t, c)] < room]
            put(i, min(free, key=lambda c: (abs(c - aim[i]) if aim[i] is not None else 0,
                                            seen[(t, c)], c)), t)

    blocks: list = []
    for b, label, _, t, _ in MAP_BLOCKS:
        if not run[b]:
            continue
        blocks.append({"id": b, "label": label, "tier": t, "cards": list(run[b])})
        if b == "features":
            blocks += [{"id": by_id[g[0]]["group"], "label": by_id[g[0]]["group"].split(":", 1)[-1],
                        "tier": 1, "within": b, "cards": list(g)}
                       for g in groups[b] if by_id[g[0]]["group"].startswith("system:")]
    return col, row, [{"label": ""} for _ in range(start)], blocks


def place_by_folder(nodes: list, groups: list) -> tuple:
    """The older layout: one column per folder, split when a folder is tall."""
    col, row, labels = {}, {}, []
    index = 0
    for group in groups:
        members = [n for n in nodes if n["group"] == group]
        if not members:
            continue
        for start in range(0, len(members), MAXROWS):
            chunk = members[start:start + MAXROWS]
            for i, n in enumerate(chunk):
                col[n["id"]] = index
                row[n["id"]] = i
            labels.append({"label": group if start == 0 else ""})
            index += 1
    return mirror(col, row, labels)
