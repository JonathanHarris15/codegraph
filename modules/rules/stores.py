# codegraph: module rules
from __future__ import annotations

import ast
import io
import re
import tokenize


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


def _blank(text: str, spans: list) -> str:
    """text with each (start, end) offset span turned to spaces, newlines kept."""
    chars = list(text)
    for a, b in spans:
        for i in range(a, b):
            if chars[i] != "\n":
                chars[i] = " "
    return "".join(chars)


def _python_prose(text: str) -> list:
    """Offset spans of the comments and docstrings in Python source."""
    starts = [0]
    for line in text.splitlines(keepends=True):
        starts.append(starts[-1] + len(line))

    def at(row: int, col: int) -> int:
        return starts[row - 1] + col

    spans = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type == tokenize.COMMENT:
                spans.append((at(*tok.start), at(*tok.end)))
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) \
                    and isinstance(node.value.value, str):
                spans.append((at(node.lineno, node.col_offset),
                              at(node.end_lineno, node.end_col_offset)))
    except (SyntaxError, ValueError, tokenize.TokenError):
        return []
    return spans


def _script_prose(text: str) -> list:
    """Offset spans of the // and /* */ comments in TypeScript or JavaScript."""
    spans, i, n, quote = [], 0, len(text), ""
    while i < n:
        c = text[i]
        if quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = ""
        elif c in "'\"`":
            quote = c
        elif text.startswith("//", i):
            end = text.find("\n", i)
            end = n if end < 0 else end
            spans.append((i, end))
            i = end
            continue
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            end = n if end < 0 else end + 2
            spans.append((i, end))
            i = end
            continue
        i += 1
    return spans


def store_calls(text: str, lang: str = "python") -> list:
    """(store, how, line) for every data call naming a store, first per store.
    SQL written in a comment or a docstring describes a call; it is not one."""
    text = _blank(text, _python_prose(text) if lang == "python" else _script_prose(text))
    out, seen = [], set()
    for regex, how in STORE_CALLS:
        for m in regex.finditer(text):
            name = m.group(1)
            if name.lower() in NOT_STORES or (name, how) in seen:
                continue
            seen.add((name, how))
            out.append((name, how, text.count("\n", 0, m.start()) + 1))
    return out
