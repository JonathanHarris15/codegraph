# codegraph: test module layout
"""Placing cards in columns and rows, through place_by_file: what is
imported sits to the left of what imports it, so wires run rightward."""
from __future__ import annotations

import unittest

from modules.layout import place_by_file


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
