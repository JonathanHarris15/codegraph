# Setup reports; fixes land one at a time

Codegraph is set up inside a codebase rather than pointed at one, through one
skill, codegraph setup, that works on a fresh project or an existing one.
Setup does four things and changes no behaviour:

1. reads the code and writes a first tag into every source file (ADR 0002),
   each a best guess at what the file is;
2. installs the mod that draws the graph inside Claude Code;
3. writes the repo's context file, so every agent working there sorts a
   request into modules, features and UI, keeps tags true, and builds test
   first;
4. hands back a ranked list of mismatches: a module acting as a feature, a
   front door that lets too much through, a page with design-system pieces
   built into it, a store with no schema.

Each fix is then its own small change, test first, on its own branch. Red on
the graph is the to-do list.

## Considered options

- **Setup fixes everything in one run.** On an existing project that means
  moving and rewriting much of the code at once: too big to review, and the
  likeliest way to break something nobody notices.

## Consequences

A project can be set up in an afternoon and cleaned up over weeks, and the
graph is honest the whole time, since what is still wrong shows as red
rather than being hidden by half-finished moves.

Adding a schema where a module has none (ADR 0003) is one of these fixes, not
part of setup itself.
