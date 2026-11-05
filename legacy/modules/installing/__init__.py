# codegraph: module installing
# codegraph: front door CONTEXT_BLOCK, PLUGIN, install_for_profile, install_in
"""Writes what turns codegraph on: the plugin in a person's own settings, and
in a repo the plugin in its settings, the rules in its agent instructions,
the drawn map out of git."""

from .install import CONTEXT_BLOCK, PLUGIN, install_for_profile, install_in
