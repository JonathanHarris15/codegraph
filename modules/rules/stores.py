# codegraph: module rules
from __future__ import annotations

import re


# Data calls that name a store. How: writes, reads, or touches when a call
# could do either.
STORE_CALLS = (
    (re.compile(r"\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bREPLACE\s+INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bUPDATE\s+[`\"\[]?(\w+)[`\"\]]?\s+SET\b", re.I), "writes"),
    (re.compile(r"\bDELETE\s+FROM\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bSELECT\b[^;'\"`]{0,400}?\bFROM\s+[`\"\[]?(\w+)", re.I), "reads"),
    (re.compile(r"\bJOIN\s+[`\"\[]?(\w+)"), "reads"),
    (re.compile(r"\.\s*(?:collection|get_collection|getCollection|table)\(\s*['\"`]([\w\-]+)['\"`]"),
     "touches"),
    (re.compile(r"\bsupabase\w*\s*\.\s*from\(\s*['\"`]([\w\-]+)['\"`]"), "touches"),
)
NOT_STORES = {"sqlite_master", "sqlite_schema", "information_schema", "dual", "pg_catalog"}


def store_calls(text: str) -> list:
    """(store, how, line) for every data call naming a store, first per store."""
    out, seen = [], set()
    for regex, how in STORE_CALLS:
        for m in regex.finditer(text):
            name = m.group(1)
            if name.lower() in NOT_STORES or (name, how) in seen:
                continue
            seen.add((name, how))
            out.append((name, how, text.count("\n", 0, m.start()) + 1))
    return out
