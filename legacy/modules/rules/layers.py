# codegraph: module rules
from __future__ import annotations



# ---------------------------------------------------------------- the rules
#
# What an import from one kind of file into another is. A pair that is not
# here breaks a rule, and WRONG says which.

RELATIONS = {
    ("module", "module"): "import",
    ("feature", "module"): "uses",
    ("page", "module"): "informed", ("component", "module"): "informed",
    ("page", "feature"): "acts", ("component", "feature"): "acts",
    ("page", "component"): "contains", ("component", "component"): "contains",
    ("page", "design"): None, ("component", "design"): None, ("design", "design"): None,
    # the shell draws every page, so it may import them to route to them
    ("shell", "page"): None, ("shell", "component"): "contains", ("shell", "design"): None,
    ("shell", "feature"): "acts", ("shell", "module"): "informed",
}
UI_KINDS = ("page", "component", "design", "shell")


def relation(a: str, b: str) -> tuple:
    """(wire kind, rule broken) for an import from a file of kind a into one
    of kind b. Tests and tooling stand outside the program, so nothing they
    import is a wire, and nothing in the program may import them."""
    if a in ("test", "tooling"):
        return None, None
    if b == "test":
        return None, "the program never imports a test"
    if b == "tooling":
        return None, "the program never imports tooling"
    if b == "shell" and a in UI_KINDS:
        return None, "nothing in the UI imports the shell; the shell draws the pages"
    if (a, b) in RELATIONS:
        return RELATIONS[(a, b)], None
    if a == "module":
        return None, "a module never calls a feature or the UI"
    if a == "feature":
        return None, ("a feature never calls another feature; share the work "
                      "through a module" if b == "feature" else
                      "a feature never reaches into the UI")
    if a == "design":
        return None, ("the design system has no wires; a piece that needs data or "
                      "starts a feature is a component")
    if b == "page":
        return None, ("a page never imports another page; share the piece as a "
                      "component, or link to the page" if a == "page" else
                      "a component never contains a page")
    return None, "{} to {} is not a wire codegraph knows".format(a, b)
