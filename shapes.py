"""shapes - what a store holds, read from the schemas the code itself uses.

A shape is never read from a comment (docs/adr/0003). It comes from
something the program runs or checks its data against:

    class Member(BaseModel): name: str        pydantic, SQLModel, TypedDict,
    @dataclass class Member: ...              dataclasses, NamedTuple
    class Member(Base): __tablename__ = ...   SQLAlchemy, with its columns
    CREATE TABLE members (id INTEGER, ...)    SQL, in a .sql file or a string
    interface Member { name: string }         TypeScript interfaces and types
    const Member = z.object({ ... })          zod
    model Member { id Int @id }               Prisma

The front door is `schemas_in`, which reads one file, and `find`, which picks
the schema a store or an event names.
"""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Schema:
    """One schema: its name, where it is written, and its fields in order."""
    name: str
    rel: str
    line: int
    fields: list = field(default_factory=list)   # [(name, type)]
    table: str = ""                             # the table or collection it maps

    def lines(self) -> list:
        return [n + (": " + t if t else "") for n, t in self.fields]


# Files that hold schemas and nothing a reader would run.
SCHEMA_FILES = (".sql", ".prisma")


def schemas_in(rel: str, text: str) -> list:
    """Every schema written in one file."""
    found: list = []
    if rel.endswith(".py"):
        found += _python(rel, text)
    elif rel.endswith(".prisma"):
        found += _prisma(rel, text)
    elif not rel.endswith(".sql"):
        found += _script(rel, text)
    found += _sql(rel, text)            # CREATE TABLE, in a .sql file or a string
    return found


def _norm(s: str) -> str:
    return re.sub(r"[_\-\s]", "", s).lower()


def _forms(word: str) -> set:
    """members, member, Members, MEMBER: the ways one name is written."""
    w = _norm(word)
    out = {w, w + "s", w + "es"}
    if w.endswith("ies"):
        out.add(w[:-3] + "y")
    if w.endswith("es"):
        out.add(w[:-2])
    if w.endswith("s"):
        out.add(w[:-1])
    if w.endswith("y"):
        out.add(w[:-1] + "ies")
    return out


def find(schemas: list, wanted: str, near: str = "", exact: bool = False):
    """The schema a store or an event names.

    `exact` is for `as Member`: the schema's own name, written as it is. Else
    the store's name matched against tables and schema names, singular or
    plural, ignoring case: store `members` finds `class Member`. A schema in
    the file the tag is written in wins over one anywhere else.
    """
    if exact:
        hits = [s for s in schemas if s.name == wanted]
    else:
        forms = _forms(wanted)
        hits = [s for s in schemas if _norm(s.table) == _norm(wanted)] or \
               [s for s in schemas if _norm(s.name) in forms or
                (s.table and _norm(s.table) in forms)]
    hits.sort(key=lambda s: (s.rel != near, s.rel, s.line))
    return hits[0] if hits else None


# ------------------------------------------------------------------ python

SCHEMA_BASES = {"BaseModel", "TypedDict", "SQLModel", "DeclarativeBase", "Base",
                "Model", "Document", "Schema", "Struct", "NamedTuple", "Table"}
SCHEMA_DECORATORS = {"dataclass", "define", "frozen", "attrs", "s"}
COLUMN_CALLS = {"Column", "mapped_column"}


def _last(node) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Call):
        return _last(node.func)
    if isinstance(node, ast.Subscript):
        return _last(node.value)
    return ""


def _type(node) -> str:
    """Mapped[int] is an int; Optional and the rest are kept as written."""
    if isinstance(node, ast.Subscript) and _last(node.value) == "Mapped":
        node = node.slice
    try:
        return ast.unparse(node)
    except Exception:
        return ""


def _python(rel: str, text: str) -> list:
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return []
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        bases = {_last(b) for b in node.bases}
        marks = {_last(d) for d in node.decorator_list}
        if not (bases & SCHEMA_BASES or any(b.endswith("Base") for b in bases)
                or marks & SCHEMA_DECORATORS):
            continue
        s = Schema(node.name, rel, node.lineno)
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                name = item.target.id
                if name.startswith("_") or _last(item.annotation) == "ClassVar":
                    continue
                s.fields.append((name, _type(item.annotation)))
            elif isinstance(item, ast.Assign) and len(item.targets) == 1 \
                    and isinstance(item.targets[0], ast.Name):
                name, value = item.targets[0].id, item.value
                if name == "__tablename__" and isinstance(value, ast.Constant):
                    s.table = str(value.value)
                elif not name.startswith("_") and isinstance(value, ast.Call):
                    call = _last(value.func)
                    kind = _type(value.args[0]) if call in COLUMN_CALLS and value.args \
                        else call
                    if call in COLUMN_CALLS or call.endswith("Field") or call == "Field":
                        s.fields.append((name, kind))
        out.append(s)
    return out


# --------------------------------------------------------------------- sql

CREATE_RE = re.compile(r"\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
                       r"[`\"\[]?(?:\w+\.)?(\w+)[`\"\]]?\s*\(", re.I)
SQL_CONSTRAINTS = ("primary", "foreign", "unique", "constraint", "check", "key", "index")


def _closing(text: str, start: int, open_: str, close: str) -> int:
    """Where the bracket opened just before `start` closes."""
    depth = 1
    for i in range(start, len(text)):
        if text[i] == open_:
            depth += 1
        elif text[i] == close:
            depth -= 1
            if not depth:
                return i
    return len(text)


def _split(body: str, seps: str = ",") -> list:
    """Split on separators that sit at the top level, not inside brackets."""
    parts, depth, cur, prev = [], 0, [], ""
    for c in body:
        if c in "([{<":
            depth += 1
        elif c in ")]}>" and not (c == ">" and prev == "="):    # => is no bracket
            depth -= 1
        prev = c
        if c in seps and depth == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(c)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def _sql(rel: str, text: str) -> list:
    out = []
    for m in CREATE_RE.finditer(text):
        body = text[m.end():_closing(text, m.end(), "(", ")")]
        s = Schema(m.group(1), rel, text.count("\n", 0, m.start()) + 1, table=m.group(1))
        for col in _split(body):
            words = col.replace("`", "").replace('"', "").split()
            if words and words[0].lower() not in SQL_CONSTRAINTS:
                s.fields.append((words[0], " ".join(words[1:2])))
        out.append(s)
    return out


# ------------------------------------------------------- typescript and zod

TS_RE = re.compile(r"\b(?:interface\s+(\w+)(?:<[^>{]*>)?(?:\s+extends\s+[^{]+)?"
                   r"|type\s+(\w+)(?:<[^>=]*>)?\s*=)\s*\{")
ZOD_RE = re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*z\s*\.\s*object\(\s*\{")
FIELD_RE = re.compile(r"^(?:readonly\s+)?[\"']?([A-Za-z_$][\w$]*)[\"']?\??\s*:\s*(.+)$", re.S)
ZOD_KIND = re.compile(r"z\s*\.\s*(\w+)")


def _script(rel: str, text: str) -> list:
    clean = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    clean = re.sub(r"(?m)//.*$", "", clean)
    out = []
    for regex, zod in ((TS_RE, False), (ZOD_RE, True)):
        for m in regex.finditer(clean):
            name = next(g for g in m.groups() if g)
            body = clean[m.end():_closing(clean, m.end(), "{", "}")]
            s = Schema(name, rel, clean.count("\n", 0, m.start()) + 1)
            for part in _split(body, ",;\n"):
                f = FIELD_RE.match(part)
                if not f or f.group(1).startswith("["):
                    continue
                kind = " ".join(f.group(2).split())
                if zod:
                    k = ZOD_KIND.search(kind)
                    kind = k.group(1) if k else kind
                s.fields.append((f.group(1), kind))
            out.append(s)
    return out


# ------------------------------------------------------------------ prisma

PRISMA_RE = re.compile(r"(?m)^\s*model\s+(\w+)\s*\{")
PRISMA_MAP = re.compile(r"@@map\(\s*[\"'](\w+)[\"']")


def _prisma(rel: str, text: str) -> list:
    out = []
    for m in PRISMA_RE.finditer(text):
        body = text[m.end():_closing(text, m.end(), "{", "}")]
        s = Schema(m.group(1), rel, text.count("\n", 0, m.start()) + 1)
        mapped = PRISMA_MAP.search(body)
        s.table = mapped.group(1) if mapped else ""
        for line in body.splitlines():
            words = line.split("//")[0].split()
            if len(words) >= 2 and not words[0].startswith("@"):
                s.fields.append((words[0], words[1]))
        out.append(s)
    return out


def schema_files(root: Path, skip: set) -> list:
    """The .sql and .prisma files under root: schemas nothing else reads."""
    out = []
    for p in sorted(root.rglob("*")):
        if p.suffix in SCHEMA_FILES and p.is_file() and \
                not any(part in skip or part.startswith(".")
                        for part in p.relative_to(root).parts[:-1]):
            out.append(p)
    return out
