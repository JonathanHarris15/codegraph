# codegraph: module source
from __future__ import annotations



# How each wire is drawn. A hue of None means the neutral grey the page uses
# for imports; everything else picks up the page's own saturation and
# lightness, so one table serves both the light and the dark theme.
KINDS = {
    "import":   {"label": "import", "hue": None, "dash": "", "width": 1.1},
    "lazy":     {"label": "import inside a function", "hue": None, "dash": "1 4", "width": 1.5},
    "http":     {"label": "HTTP call", "hue": 265, "dash": "7 4", "width": 1.5},
    "serves":   {"label": "serves HTTP", "hue": 205, "dash": "7 4", "width": 1.6},
    "database": {"label": "database", "hue": 170, "dash": "3 3", "width": 1.6},
    "market":   {"label": "market data / orders", "hue": 35, "dash": "7 4", "width": 1.6},
    "feed":     {"label": "feed", "hue": 320, "dash": "7 4", "width": 1.5},
    "queue":    {"label": "queue", "hue": 55, "dash": "7 4", "width": 1.5},
    "cloud":    {"label": "cloud service", "hue": 240, "dash": "7 4", "width": 1.5},
    "process":  {"label": "starts a process", "hue": 15, "dash": "10 5", "width": 1.6},
    "env":      {"label": "environment", "hue": 95, "dash": "3 3", "width": 1.4},
    # the map's own wires, between what files belong to (CONTEXT.md, Wires).
    # head says where the arrowhead sits: where information arrives.
    "uses":     {"label": "uses", "hue": 150, "dash": "", "width": 1.6, "head": "both"},
    "informed": {"label": "informed by", "hue": 200, "dash": "", "width": 1.3, "head": "from"},
    "acts":     {"label": "acts on", "hue": 285, "dash": "", "width": 1.6, "head": "both"},
    "contains": {"label": "contains", "hue": 305, "dash": "2 3", "width": 1.2, "head": "to"},
    "starts":   {"label": "starts", "hue": 45, "dash": "", "width": 1.6, "head": "to"},
    "writes":   {"label": "writes", "hue": 180, "dash": "", "width": 1.8, "head": "to"},
    "reads":    {"label": "reads", "hue": 180, "dash": "4 3", "width": 1.4, "head": "from"},
    "leads":    {"label": "leads to", "hue": 330, "dash": "", "width": 1.5, "head": "to"},
}

OUTSIDE = "(outside)"
EXTERNAL = "(external)"
