# codegraph: test module layout
"""Placing cards in columns and rows, through place_by_file: what is
imported sits to the left of what imports it, so wires run rightward."""
from __future__ import annotations

import unittest

from modules.layout import place_by_file, place_map, size_cards


def place(ids: list, pairs: list) -> tuple:
    """(column, row) per card, for cards that import each other as pairs say."""
    nodes = [{"id": i, "group": "g", "label": i} for i in ids]
    col, row, _ = place_by_file(nodes, pairs, [])
    return col, row


def backward(col: dict, pairs: list) -> list:
    """The wires that do not run rightward, from what is imported."""
    return [(s, d) for s, d in pairs if col[d] >= col[s]]


class Layering(unittest.TestCase):
    """Columns by import depth: one past the furthest thing that imports you."""

    def test_a_chain_spreads_across_columns(self):
        col, _ = place(["a", "b", "c"], [("a", "b"), ("b", "c")])
        self.assertLess(col["c"], col["b"])
        self.assertLess(col["b"], col["a"])

    def test_the_longest_path_wins(self):
        # a -> b -> c and a -> c: c sits past b, not beside it
        col, _ = place(["a", "b", "c"], [("a", "b"), ("b", "c"), ("a", "c")])
        self.assertLess(col["c"], col["b"])

    def test_entry_points_share_a_column(self):
        col, _ = place(["cli", "app", "models"], [("cli", "models"), ("app", "models")])
        self.assertEqual(col["cli"], col["app"])

    def test_an_entry_point_and_a_leaf_no_longer_collide(self):
        col, _ = place(["cli", "models"], [("cli", "models")])
        self.assertNotEqual(col["cli"], col["models"])

    def test_a_loop_is_broken_not_fatal(self):
        col, _ = place(["a", "b"], [("a", "b"), ("b", "a")])
        self.assertEqual(sorted(col), ["a", "b"])

    def test_only_the_wire_closing_a_loop_points_back(self):
        pairs = [("a", "b"), ("b", "a")]
        col, _ = place(["a", "b"], pairs)
        self.assertEqual(backward(col, pairs), [("b", "a")])

    def test_a_diamond_points_nowhere_back(self):
        pairs = [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]
        col, _ = place(list("abcd"), pairs)
        self.assertEqual(backward(col, pairs), [])


class RowOrder(unittest.TestCase):
    def test_rows_are_a_full_run_per_column(self):
        col, row = place(["a", "b", "c", "d", "e"], [("a", "c"), ("b", "d"), ("a", "e")])
        for c in set(col.values()):
            here = [n for n in col if col[n] == c]
            self.assertEqual(sorted(row[n] for n in here), list(range(len(here))))

    def test_a_card_moves_level_with_what_it_is_wired_to(self):
        # x is wired to the last of a, b, c, so it should not stay first
        col, row = place(["a", "b", "c", "x", "y"], [("c", "x"), ("a", "y")])
        self.assertEqual(col["x"], col["y"])
        self.assertGreater(row["x"], row["y"])


def sketch(cards: dict, pairs: list = ()) -> tuple:
    """Lay out the map for cards given as {id: kind}; ({id: (tier, col, row)},
    {id: block}, the blocks)."""
    nodes = [{"id": i, "kind": k, "group": k, "label": i, "files": []} for i, k in cards.items()]
    col, row, _, blocks = place_map(nodes, list(pairs))
    tier = {i: b["tier"] for b in blocks for i in b["cards"]}
    block = {i: b["id"] for b in blocks for i in b["cards"]}
    return {i: (tier[i], col[i], row[i]) for i in cards}, block, blocks


class TheMap(unittest.TestCase):
    """Modules on the left with what they reach above them, features in the
    middle, pages in a tall column on the right with the design system and
    components below: a shape that fits a square window."""

    CARDS = {"m:a": "module", "m:b": "module", "f:x": "feature", "p:home": "page",
             "c:button": "component", "design": "design", "store:s": "store",
             "svc:web": "outside", "t:daily": "trigger"}

    def test_outside_connections_and_stores_sit_above_the_modules(self):
        at, _, _ = sketch(self.CARDS)
        mods = {at[m][1] for m in ("m:a", "m:b")}
        for above in ("store:s", "svc:web"):
            self.assertLess(at[above][0], at["m:a"][0])
            self.assertIn(at[above][1], mods)

    def test_triggers_sit_above_the_features(self):
        at, _, _ = sketch(self.CARDS)
        self.assertLess(at["t:daily"][0], at["f:x"][0])
        self.assertEqual(at["t:daily"][1], at["f:x"][1])

    def test_the_design_system_and_components_sit_below_the_pages(self):
        at, _, _ = sketch(self.CARDS)
        for below in ("c:button", "design"):
            self.assertGreater(at[below][0], at["p:home"][0])
            self.assertEqual(at[below][1], at["p:home"][1])

    def test_modules_then_features_then_pages_left_to_right(self):
        at, _, _ = sketch(self.CARDS)
        self.assertLess(max(at[m][1] for m in ("m:a", "m:b")), at["f:x"][1])
        self.assertLess(at["f:x"][1], at["p:home"][1])

    def test_each_part_is_a_named_block(self):
        _, block, blocks = sketch(self.CARDS)
        self.assertEqual(block["m:a"], block["m:b"])
        self.assertNotEqual(block["m:a"], block["f:x"])
        self.assertEqual(block["c:button"], block["design"])
        self.assertTrue(all(b["label"] for b in blocks))

    def test_many_modules_wrap_into_columns_but_pages_stay_one(self):
        cards = {"m:%02d" % i: "module" for i in range(16)}
        cards.update({"p:%d" % i: "page" for i in range(6)})
        chain = [("m:%02d" % (i + 1), "m:%02d" % i) for i in range(15)]
        at, _, _ = sketch(cards, chain)
        mods = {at["m:%02d" % i][1] for i in range(16)}
        self.assertGreater(len(mods), 1)
        self.assertLess(len(mods), 16)
        self.assertEqual(len({at["p:%d" % i][1] for i in range(6)}), 1)

    def test_the_modules_and_features_blocks_come_out_about_as_tall(self):
        # one long strip of modules beside a wide row of features is square
        # overall, but it is not the shape in the drawing
        nodes = [{"id": "m:%d" % i, "kind": "module", "group": "m", "label": str(i),
                  "files": ["f"] * (7 if i == 0 else 2 + i % 3)} for i in range(8)]
        nodes += [{"id": "f:%d" % i, "kind": "feature", "group": "f", "label": str(i),
                   "files": ["f"]} for i in range(4)]
        nodes += [{"id": "p:%d" % i, "kind": "page", "group": "p", "label": str(i),
                   "files": ["f"]} for i in range(2)]
        col, _, _, _ = place_map(nodes, [])
        mods = len({col["m:%d" % i] for i in range(8)})
        feats = len({col["f:%d" % i] for i in range(4)})
        self.assertGreater(mods, 1)
        self.assertLessEqual(feats, mods)

    def test_features_sit_together_by_system(self):
        nodes = [{"id": "f:%d" % i, "kind": "feature", "group": "system:" + "abab"[i],
                  "label": str(i), "files": []} for i in range(4)]
        col, row, _, blocks = place_map(nodes, [])
        by = {g: [col["f:%d" % i] for i in range(4) if "abab"[i] == g] for g in "ab"}
        self.assertEqual(len(set(by["a"])), 1)
        self.assertEqual(len(set(by["b"])), 1)
        self.assertIn({"id": "system:a", "label": "a", "tier": 1, "within": "features",
                       "cards": ["f:0", "f:2"]}, [dict(b, cards=sorted(b["cards"])) for b in blocks])

    def test_a_store_sits_above_the_module_that_owns_it(self):
        cards = {"m:%d" % i: "module" for i in range(10)}
        cards["store:s"] = "store"
        pairs = [("m:%d" % (i + 1), "m:%d" % i) for i in range(9)] + [("m:9", "store:s")]
        at, _, _ = sketch(cards, pairs)
        self.assertEqual(at["store:s"][1], at["m:9"][1])

    def test_a_trigger_sits_above_the_feature_it_starts(self):
        cards = {"f:%d" % i: "feature" for i in range(12)}
        cards.update({"m:%d" % i: "module" for i in range(12)})
        cards["t:x"] = "trigger"
        at, _, _ = sketch(cards, [("t:x", "f:11")])
        self.assertEqual(at["t:x"][1], at["f:11"][1])

    def test_a_module_used_comes_before_the_module_using_it(self):
        cards = {"m:%02d" % i: "module" for i in range(16)}
        chain = [("m:%02d" % (i + 1), "m:%02d" % i) for i in range(15)]
        at, _, _ = sketch(cards, chain)
        for user, used in chain:
            self.assertLess(at[used][1:], at[user][1:])


class Sizes(unittest.TestCase):
    """A card draws as big as the code it holds, next to the others in view."""

    def test_a_big_module_draws_bigger_than_a_small_one(self):
        nodes = [{"id": "big", "lines": 2000}, {"id": "mid", "lines": 400},
                 {"id": "small", "lines": 300}, {"id": "store", "lines": 0}]
        size_cards(nodes)
        size = {n["id"]: n["size"] for n in nodes}
        self.assertGreater(size["big"], size["mid"])
        self.assertGreater(size["mid"], size["small"])
        self.assertEqual(size["store"], 1)

    def test_sizes_stay_in_bounds(self):
        nodes = [{"id": "a", "lines": 100000}, {"id": "b", "lines": 10}, {"id": "c", "lines": 100}]
        size_cards(nodes)
        self.assertTrue(all(0.9 <= n["size"] <= 2 for n in nodes))
