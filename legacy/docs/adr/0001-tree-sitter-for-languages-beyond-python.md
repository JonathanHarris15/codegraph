# Read languages beyond Python with tree-sitter

codegraph has to read many languages, and breaking a file into its parts is
the one job every language shares. We read every language but Python with
tree-sitter, one parser library with a grammar per language, instead of
writing a parser of our own for each. Python keeps the standard `ast` module,
which needs no install and already passes its tests.

This ends the earlier habit of using no third-party packages. That was never a
requirement: a Claude Code mod runs codegraph as a separate program, so any
package installed on the machine is fine. A codebase in Python alone still
needs nothing installed; a language whose grammar is missing is skipped with a
note, not a crash.

## Considered options

- **A hand-written parser per language.** Months of work per language, and
  worse than tree-sitter at it.
- **Language servers.** Exact, but each needs its own toolchain installed and
  running, and they are slow to start on a large codebase.

## Consequences

Parsing is the easy half. Working out which file an import lands on (path
shortcuts in `tsconfig.json`, `index.ts`, Go modules) is written by hand in
each language's reader, and is where most of a reader's effort and bugs live.
