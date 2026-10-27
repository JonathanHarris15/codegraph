# codegraph: module rules
from __future__ import annotations

import ast
import io
import re
import tokenize


# Data calls that name a store. How: writes, reads, or touches when a call
# could do either. SQL names a table outright; a call names its store in a
# string, or in a constant holding one, such as Firebase's modular
# `collection(db, SALES)`.
SQL_CALLS = (
    (re.compile(r"\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bREPLACE\s+INTO\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bUPDATE\s+[`\"\[]?(\w+)[`\"\]]?\s+SET\b", re.I), "writes"),
    (re.compile(r"\bDELETE\s+FROM\s+[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\"\[]?(\w+)", re.I), "writes"),
    (re.compile(r"\bSELECT\b[^;'\"`]{0,400}?\bFROM\s+[`\"\[]?(\w+)", re.I), "reads"),
    (re.compile(r"\bJOIN\s+[`\"\[]?(\w+)"), "reads"),
)
REF = r"""(['"`][\w\-]+['"`]|[A-Za-z_$][\w$]*)"""      # a string, or a constant's name
NAMED_CALLS = (
    (re.compile(r"\.\s*(?:collection|get_collection|getCollection|table)\(\s*" + REF + r"\s*[,)]"),
     "touches"),
    (re.compile(r"\bsupabase\w*\s*\.\s*from\(\s*" + REF + r"\s*[,)]"), "touches"),
    (re.compile(r"(?<![.\w])(?:collection|collectionGroup)\(\s*[\w$.]+\s*,\s*" + REF + r"\s*[,)]"),
     "touches"),
    (re.compile(r"(?<![.\w])doc\(\s*[\w$.]+\s*,\s*" + REF + r"\s*,"), "touches"),
)
SQL_WORDS = {"SELECT", "FROM", "INSERT", "INTO", "OR", "REPLACE", "UPDATE", "SET", "DELETE",
             "CREATE", "TABLE", "IF", "NOT", "EXISTS", "JOIN"}
NOT_STORES = {"sqlite_master", "sqlite_schema", "information_schema", "dual", "pg_catalog"}

# A file that draws UI holds copy a person reads, and copy can read like SQL
# ("Select a CSV export from MLS"). Its SQL is only read when it also shows
# signs of running some.
JSX = re.compile(r"</[A-Za-z]|/>")
RUNS_SQL = re.compile(r"\bsql`|\.\s*(?:query|execute|exec|prepare|raw)\(|\$(?:query|execute)Raw")

CONSTANTS = {
    "python": re.compile(r"""(?m)^([A-Za-z_]\w*)\s*(?::\s*\w+\s*)?=\s*["']([\w\-]+)["']\s*$"""),
    "script": re.compile(r"""\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*\w+\s*)?="""
                         r"""\s*["'`]([\w\-]+)["'`]"""),
}


def constants_in(text: str, lang: str = "python") -> dict:
    """{name: string} for each constant a file sets to a plain string, the way
    a store's name is often kept: `SALES = "sales"`, `const SALES = 'sales'`."""
    regex = CONSTANTS["python" if lang == "python" else "script"]
    return {m.group(1): m.group(2) for m in regex.finditer(text)}


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


def _sql_case(said: str) -> bool:
    """SQL keywords are written in capitals or in lower case; "Select a file
    from MLS" is a sentence."""
    return all(w.isupper() or w.islower() for w in re.findall(r"[A-Za-z]+", said)
               if w.upper() in SQL_WORDS)


def store_calls(text: str, lang: str = "python", constants: dict | None = None) -> list:
    """(store, how, line) for every data call naming a store, first per store.
    SQL written in a comment or a docstring describes a call; it is not one.
    A store named by a constant is looked up in `constants`, after the
    constants the file itself sets."""
    known = dict(constants or {}, **constants_in(text, lang))
    text = _blank(text, _python_prose(text) if lang == "python" else _script_prose(text))
    calls = list(NAMED_CALLS)
    if lang == "python" or not JSX.search(text) or RUNS_SQL.search(text):
        calls = list(SQL_CALLS) + calls
    out, seen = [], set()
    for regex, how in calls:
        for m in regex.finditer(text):
            name = m.group(1)
            if regex in (r for r, _ in NAMED_CALLS):
                name = name[1:-1] if name[0] in "'\"`" else known.get(name)
            elif not _sql_case(m.group(0)):
                continue
            if not name or name.lower() in NOT_STORES or (name, how) in seen:
                continue
            seen.add((name, how))
            out.append((name, how, text.count("\n", 0, m.start()) + 1))
    return out
