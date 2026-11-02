# codegraph

Two folders, and they are read apart.

- **`legacy/`** — the first codegraph: a Claude Code plugin written in Python
  that reads tags out of a repo and draws a map beside the chat. It is kept
  working and installable, but new work does not go here. It has its own
  `CLAUDE.md` and `CONTEXT.md`; read those before touching it.
- **`desktop/`** — the codegraph app a person opens: a window that shows
  their projects, the codebases in each one, and whether each codebase is set
  up and up to date. This is where new work goes. It has its own `CLAUDE.md`
  and `CONTEXT.md` too.

Work in one folder at a time. A change that spans both is a sign the seam is
in the wrong place — say so rather than threading it through.
