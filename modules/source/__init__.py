# codegraph: module source
# codegraph: front door DESIGNS, EXTERNAL, KINDS, OUTSIDE, SKIP_DIRS, files_in, reader_of, text_of
"""Reads a repo's source files: what each imports, and what it reaches outside the program."""

from .files import DESIGNS, SKIP_DIRS, text_of
from .kinds import EXTERNAL, KINDS, OUTSIDE
from .readers import files_in, reader_of
