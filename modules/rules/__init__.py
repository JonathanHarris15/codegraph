# codegraph: module rules
# codegraph: front door Finding, Report, UI_KINDS, read_map, relation, route_of, store_calls
"""Reads the code against its tags: every rule in CONTEXT.md at once."""

from .layers import UI_KINDS, relation
from .pages import route_of
from .reading import Finding, Report, read_map
from .stores import store_calls
