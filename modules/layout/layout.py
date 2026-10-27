# codegraph: module layout
from __future__ import annotations

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


MAP_BANDS = (("outside", "outside"), ("store", "stores"), ("module", "modules"),
             ("feature", "features"), ("trigger", "triggers"), ("component", "UI"),
             ("page", "pages"))


def place_map(nodes: list, pairs: list) -> tuple:
    """Lay out the map in bands, left to right as data flows to a person:
    outside connections, stores, modules, features, triggers, the pieces of
    UI, then pages. Modules that use other modules sit right of them."""
    band_of = {"external": "outside", "design": "component", "loose": "page"}
    kinds = {n["id"]: band_of.get(n["kind"], n["kind"]) for n in nodes}
    mods = [i for i, k in kinds.items() if k == "module"]
    depth = layer(mods, [(s, d) for s, d in pairs if s in set(mods) and d in set(mods)])
    deepest = max(depth.values(), default=0)

    col: dict = {}
    labels: list = []
    for kind, label in MAP_BANDS:
        ids = [i for i, k in kinds.items() if k == kind]
        if not ids:
            continue
        if kind == "module":
            for i in ids:
                col[i] = len(labels) + deepest - depth[i]      # used on the left
            labels += [label] + [""] * deepest
        else:
            col.update({i: len(labels) for i in ids})
            labels.append(label)
    for i in kinds:                                  # anything else, at the end
        if i not in col:
            col[i] = len(labels) - 1 if labels else 0

    columns: dict = defaultdict(list)
    order = {n["id"]: (n["group"], n["label"]) for n in nodes}
    for i in kinds:
        columns[col[i]].append(i)
    for c in columns:
        columns[c].sort(key=lambda i: order[i])
    return col, order_rows(columns, pairs), [{"label": l} for l in labels]


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
