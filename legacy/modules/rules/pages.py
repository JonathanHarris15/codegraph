# codegraph: module rules
from __future__ import annotations

import re


# Links a page or component follows, as written in its code: an attribute or
# a key (`href=`, `to:`, a form's `action=` that posts the person there, a
# `pathname:` written beside a query, and where a sign-in sends people after,
# such as `callbackUrl`, `redirectTo` or `forceRedirectUrl`), or a call that
# moves the person on, a status code or `url=` before the path allowed.
KEYS = r"""(?:href|to|action|pathname|callbackUrl|returnTo|return_to|\w*[Rr]edirect(?:Url|URL|To|_to|_url))"""
CALLS = (r"""(?:navigate|navigateTo|push|replace|redirect|goto|assign|redirect_to"""
         r"""|RedirectResponse|HttpResponseRedirect)""")
LINK_RES = (
    re.compile(r"""\b""" + KEYS + r"""\s*[=:]\s*\{?\s*(["'`])(.*?)\1"""),
    re.compile(r"""\b""" + CALLS + r"""\(\s*(?:\d+\s*,\s*)?(?:url\s*=\s*)?(["'`])(.*?)\1"""),
)
BUILT_LINK_RES = (
    re.compile(r"""\b(?:href|to)\s*=\s*\{\s*(?![\s"'`]|\{\s*pathname\s*:\s*["'`])"""),
    re.compile(r"""\b(?:router\.push|router\.replace|navigate|redirect)\(\s*"""
               r"""(?![\s"'`)]|\d+\s*,\s*["'`]|\{\s*to\s*:\s*["'`])"""),
)


def page_links(text: str) -> list:
    """(link, line) for each link written out, and (None, line) for each one
    built while the program runs, which cannot be followed."""
    out = []
    for regex in LINK_RES:
        for m in regex.finditer(text):
            link = m.group(2)
            if link.startswith("/") and not link.startswith("//"):
                out.append((link, text.count("\n", 0, m.start()) + 1))
    for regex in BUILT_LINK_RES:
        for m in regex.finditer(text):
            out.append((None, text.count("\n", 0, m.start()) + 1))
    return out


def route_of(rel: str) -> str:
    """The route a framework gives a page file: Next.js app/ and pages/."""
    parts = rel.split("/")
    stem = parts[-1].rsplit(".", 1)[0]
    folders = parts[:-1]
    if "app" in folders and stem == "page":
        i = len(folders) - 1 - folders[::-1].index("app")
        segs = [p for p in folders[i + 1:] if not (p.startswith("(") and p.endswith(")"))
                and not p.startswith("@")]
        return "/" + "/".join(segs)
    if "pages" in folders:
        i = len(folders) - 1 - folders[::-1].index("pages")
        segs = folders[i + 1:] + ([] if stem == "index" else [stem])
        if stem.startswith("_") or (segs and segs[0] == "api"):
            return ""
        return "/" + "/".join(segs)
    return ""


def _segs(path: str) -> list:
    path = re.split(r"[?#]", path)[0].strip("/")
    return path.split("/") if path else []


def route_matches(link: str, route: str) -> bool:
    """Does a written link land on a page's route? `[id]` and `:id` take any
    one part, `[...rest]` the rest, and `${...}` in the link stands for any."""
    a, b = _segs(link), _segs(route)
    for i, r in enumerate(b):
        if r.startswith("[...") or r.startswith("[[..."):
            return len(a) >= i
        if i >= len(a):
            return False
        if not (r.startswith("[") or r.startswith(":") or "${" in a[i] or a[i] == r):
            return False
    return len(a) == len(b)
