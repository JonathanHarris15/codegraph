# codegraph: module planning
# codegraph: front door compare, left_behind, read_plans
"""Reads the plans waiting in `plans/` and holds each against the map read from the code."""

from .plans import compare, left_behind, read_plans
