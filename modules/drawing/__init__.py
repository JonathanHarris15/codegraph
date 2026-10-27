# codegraph: module drawing
# codegraph: front door build, map_of, nodes_by_id, render, summary
"""Turns a reading of the code into the map: the page, the views on it, and the pane's summary."""

from .graph import build, map_of
from .page import nodes_by_id, render
from .pane import summary
