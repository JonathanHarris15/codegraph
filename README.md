# codegraph

A map of a codebase drawn at the level people think in — systems, features,
modules, stores, pages — instead of files.

## What is in here

**`desktop/`** is the codegraph app. Open it and you see your projects as a
grid of cards. A project holds one or more codebases; each card says whether
each codebase is set up for codegraph, tracked by git, and level with the
copy on GitHub. Start here: [`desktop/README.md`](desktop/README.md).

**`legacy/`** is the first codegraph — a Claude Code plugin in Python that
draws the map beside the chat and checks tags after every change. Still
installable, still working, no longer the front door. See
[`legacy/README.md`](legacy/README.md).
