# codegraph: test module layout
"""Placing cards in columns and rows."""
from __future__ import annotations

import unittest

from modules.layout.layout import back_edges, layer, order_rows


class Layering(unittest.TestCase):
    """Columns by import depth: one past the furthest thing that imports you."""

    def test_a_chain_spreads_across_columns(self):
        col = layer(["a", "b", "c"], [("a", "b"), ("b", "c")])
        self.assertEqual([col["a"], col["b"], col["c"]], [0, 1, 2])

    def test_the_longest_path_wins(self):
        # a -> b -> c and a -> c: c sits past b, not beside it
        col = layer(["a", "b", "c"], [("a", "b"), ("b", "c"), ("a", "c")])
        self.assertEqual(col["c"], 2)

    def test_entry_points_share_the_first_column(self):
        col = layer(["cli", "app", "models"],
                       [("cli", "models"), ("app", "models")])
        self.assertEqual(col["cli"], 0)
        self.assertEqual(col["app"], 0)

    def test_an_entry_point_and_a_leaf_no_longer_collide(self):
        col = layer(["cli", "models"], [("cli", "models")])
        self.assertNotEqual(col["cli"], col["models"])

    def test_a_loop_is_broken_not_fatal(self):
        col = layer(["a", "b"], [("a", "b"), ("b", "a")])
        self.assertEqual(sorted(col), ["a", "b"])

    def test_back_edges_are_the_ones_closing_a_loop(self):
        self.assertEqual(back_edges(["a", "b"], [("a", "b"), ("b", "a")]),
                         {("b", "a")})

    def test_a_diamond_has_no_back_edge(self):
        pairs = [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]
        self.assertEqual(back_edges(list("abcd"), pairs), set())


class RowOrder(unittest.TestCase):
    def test_rows_are_a_full_run_per_column(self):
        cols = {0: ["a", "b"], 1: ["c", "d", "e"]}
        rows = order_rows(cols, [("a", "c"), ("b", "d")])
        self.assertEqual(sorted(rows[n] for n in cols[0]), [0, 1])
        self.assertEqual(sorted(rows[n] for n in cols[1]), [0, 1, 2])

    def test_a_card_moves_level_with_what_it_is_wired_to(self):
        # x is wired to the last card of column 0, so it should not stay first
        cols = {0: ["a", "b", "c"], 1: ["x", "y"]}
        rows = order_rows(cols, [("c", "x"), ("a", "y")])
        self.assertGreater(rows["x"], rows["y"])
