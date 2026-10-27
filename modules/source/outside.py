# codegraph: module source
from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from fnmatch import fnmatchcase
from urllib.parse import urlsplit

from .kinds import KINDS


# What a call has to look like for us to believe it leaves the process.
# The pattern is matched, fnmatch style, against the call's dotted name after
# the file's own imports have been followed: `from httpx import Client` then
# `Client(...)` is matched as `httpx.Client`.
#
# service=None means the library alone does not say where it is going. The
# destination then comes from a URL in the same file, and failing that the
# library itself becomes the card.
PROBES = (
    ("sqlite3.connect",             "database", "sqlite"),
    ("sqlalchemy.create_engine",    "database", None),
    ("psycopg*.connect",            "database", "postgres"),
    ("asyncpg.*connect*",           "database", "postgres"),
    ("pymysql.connect",             "database", "mysql"),
    ("MySQLdb.connect",             "database", "mysql"),
    ("pymongo.MongoClient",         "database", "mongodb"),
    ("redis.*Redis",                "database", "redis"),
    ("*.duckdb.connect",            "database", "duckdb"),
    ("duckdb.connect",              "database", "duckdb"),

    ("httpx.Client",                "http", None),
    ("httpx.AsyncClient",           "http", None),
    ("httpx.get", "http", None), ("httpx.post", "http", None),
    ("requests.*",                  "http", None),
    ("aiohttp.ClientSession",       "http", None),
    ("urllib.request.urlopen",      "http", None),
    ("urllib.request.Request",      "http", None),
    ("http.client.*Connection",     "http", None),
    ("openai.*",                    "http", "openai"),
    ("anthropic.*",                 "http", "anthropic"),

    ("feedparser.parse",            "feed", None),

    ("alpaca.*Client",              "market", "alpaca"),
    ("ccxt.*",                      "market", "ccxt"),
    ("yfinance.*",                  "market", "yahoo finance"),
    ("ib_insync.*",                 "market", "interactive brokers"),

    ("boto3.client",                "cloud", "aws"),
    ("boto3.resource",              "cloud", "aws"),
    ("google.cloud.*",              "cloud", "google cloud"),
    ("azure.*",                     "cloud", "azure"),

    ("fastapi.FastAPI",             "serves", None),
    ("flask.Flask",                 "serves", None),
    ("uvicorn.run",                 "serves", None),
    ("socket.socket",               "serves", None),

    ("celery.Celery",               "queue", "celery"),
    ("kafka.*",                     "queue", "kafka"),
    ("pika.*Connection",            "queue", "rabbitmq"),

    ("subprocess.run",              "process", None),
    ("subprocess.Popen",            "process", None),
    ("subprocess.check_*",          "process", None),
    ("os.system",                   "process", None),

    ("os.getenv",                   "env", "environment"),
    ("os.environ.get",              "env", "environment"),
    ("dotenv.load_dotenv",          "env", "environment"),
)

URL_RE = re.compile(r"""\b[a-z][a-z0-9+.\-]{1,12}://[^\s"'`<>\\{}|^]+""", re.I)

SCHEME_KIND = {
    "http": "http", "https": "http", "ws": "http", "wss": "http",
    "postgres": "database", "postgresql": "database", "mysql": "database",
    "mongodb": "database", "mongodb+srv": "database", "redis": "database",
    "sqlite": "database", "clickhouse": "database",
    "amqp": "queue", "amqps": "queue", "kafka": "queue",
    "s3": "cloud", "gs": "cloud", "file": None,
}


# ------------------------------------------------------- outside connections

@dataclass(frozen=True)
class Conn:
    """One connection a file appears to make to something outside itself."""
    kind: str          # http | database | market | feed | serves | ...
    target: str        # node id: net:api.example.com, svc:sqlite, env:environment
    label: str         # what the card says
    detail: str        # the line under it


ENVIRONMENT = Conn("env", "env:environment", "environment", "environment variables")


def symbol_table(tree: ast.AST) -> dict:
    """What each imported name in this file really refers to.

    `from httpx import Client` makes `Client(...)` mean `httpx.Client`, and
    `import numpy as np` makes `np.array` mean `numpy.array`. Without this a
    probe table only ever matches code written one particular way.
    """
    syms: dict = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    syms[alias.asname] = alias.name
                else:
                    root = alias.name.split(".")[0]
                    syms[root] = root
        elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
            for alias in node.names:
                syms[alias.asname or alias.name] = node.module + "." + alias.name
    return syms


def dotted_name(node: ast.AST) -> str:
    """`a.b.c(...)` -> "a.b.c". Anything built at runtime -> ""."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return ""


def through_imports(name: str, syms: dict) -> str:
    """Rewrite a dotted name through this file's imports."""
    if not name:
        return ""
    head, _, tail = name.partition(".")
    origin = syms.get(head)
    if not origin:
        return name
    return origin + ("." + tail if tail else "")


def match_probe(name: str, probes: tuple = PROBES):
    for pattern, kind, service in probes:
        if fnmatchcase(name, pattern):
            return kind, service
    return None


# Hosts whose URLs name an XML namespace (`xmlns="http://www.w3.org/2000/svg"`):
# written in the code, never fetched.
NAMESPACE_HOSTS = {"www.w3.org", "schemas.xmlsoap.org", "schemas.microsoft.com"}


def urls_from(strings) -> list:
    """Every URL written in these strings, scheme and host pulled apart."""
    found = []
    for text in strings:
        for raw in URL_RE.findall(text):
            bits = urlsplit(raw.rstrip(".,);"))
            # a port filled in later, `http://host:${port}`, leaves a bare colon
            host = bits.netloc.split("@")[-1].rstrip(":")
            if not host or host in NAMESPACE_HOSTS:
                continue
            found.append((bits.scheme.lower(), host, bits.path or "/"))
    return found


def urls_in(tree: ast.AST) -> list:
    """Every URL written as a string literal in a Python file."""
    return urls_from(n.value for n in ast.walk(tree)
                     if isinstance(n, ast.Constant) and isinstance(n.value, str))


def read_outside(path: Path) -> list:
    """What this one Python file appears to reach outside the process.

    Two kinds of evidence, both syntactic: a call that matches the probe
    table, and a URL written as a string. Neither is run.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except (OSError, SyntaxError, ValueError):
        return []

    syms = symbol_table(tree)
    calls = [through_imports(dotted_name(n.func), syms)
             for n in ast.walk(tree) if isinstance(n, ast.Call)]
    # os.environ["KEY"] is a subscript, not a call
    env = any(isinstance(n, ast.Subscript) and
              through_imports(dotted_name(n.value), syms) == "os.environ"
              for n in ast.walk(tree))
    return connections(calls, urls_in(tree), env, PROBES)


def connections(calls: list, urls: list, env: bool, probes: tuple) -> list:
    """Turn what a file calls, the URLs it writes down and whether it reads
    the environment into its outside connections. The same for every
    language; only the probe table differs."""
    conns: dict = {}

    def keep(conn: Conn) -> None:
        conns.setdefault(conn.target, conn)

    # Calls first. A library says what sort of connection this is, which is
    # worth more than the scheme on a URL: feedparser.parse("https://...") is
    # a feed, not a plain HTTP call.
    loose: list = []
    for name in calls:
        hit = match_probe(name, probes)
        if not hit:
            continue
        kind, service = hit
        if kind == "env":
            keep(ENVIRONMENT)             # however it was reached, it is one card
        elif service:
            keep(Conn(kind, "svc:" + service, service, KINDS[kind]["label"]))
        else:
            loose.append((kind, name))
    if env:
        keep(ENVIRONMENT)

    # Does one library in this file say what its URLs are for?
    speaks = {k for k, _ in loose if k in ("feed", "market", "database", "queue", "cloud")}
    house = speaks.pop() if len(speaks) == 1 else None

    hosts: set = set()
    for scheme, host, route in urls:
        # an unknown scheme, obsidian:// or slack://, opens an app, not a host
        kind = SCHEME_KIND.get(scheme)
        if kind is None:
            continue
        if house and kind == "http":
            kind = house
        hosts.add(kind)
        keep(Conn(kind, "net:" + host, host, scheme + " " + route))

    # A client with no URL beside it: name the library, not a destination.
    for kind, name in loose:
        if kind in hosts:
            continue                      # a URL in this file already says where
        lib = name.split(".")[0]
        keep(Conn(kind, "svc:" + lib, lib, _vague(kind)))

    return list(conns.values())


def _vague(kind: str) -> str:
    """What to write on a card when the library is all we know."""
    if kind == "serves":
        return "serves HTTP from this process"
    if kind == "process":
        return "runs other programs"
    return KINDS[kind]["label"] + ", destination not in the source"
