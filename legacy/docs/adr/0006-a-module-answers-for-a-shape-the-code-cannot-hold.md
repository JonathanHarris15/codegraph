# A module answers for a shape the code cannot hold

A shape comes from something the program runs, never a comment (docs/adr/0003).
Usually that is a schema sitting in the code: a model, a migration, a validator,
a type. codegraph reads it, and the map is true because the program is checked
against the same thing the map was drawn from.

Sometimes the fields are not in the code to read. An app whose columns the people
using it add to, rename and switch on and off keeps that catalogue in the
database; the code holds only the machinery that assembles a shape from it. There
is nothing to read, and no honest way to write it down: a hand-kept list would be
a second catalogue, wrong the first time somebody added a column. Such a store
was drawn with an unknown shape — correct, and useless for the store that matters
most.

A module may now answer for its own store. A file of the owning module tagged

    # codegraph: shape of sales

prints the shape as JSON when it is run:

    {"name": "Sale", "fields": {"saleNo": "text", "acres": "number"}}

codegraph runs it while it reads the repo and takes it at its word. What the
helper reads to work the answer out is the owning module's business: its own
catalogue, the schema the app checks writes against, or the live store. The rule
in 0003 holds — the shape still comes from something the program runs, and the
module that owns the store is still what keeps its part of the map true. What
changes is that the module may run to say so, rather than only be read.

## Considered options

- **Leave it unknown.** Honest, and the map stays a pure read of the code. But
  the one store a person most wants to see is the one whose columns are theirs.
- **Generate a schema file and commit it.** codegraph needs no new feature; the
  module writes a literal schema and a test keeps it current. It is a second
  list, kept by a habit, and stale the day someone forgets.
- **Sample the database inside codegraph.** Rejected in 0003 and still wrong:
  codegraph would need credentials, know nothing of what the code expects, and
  show every abandoned field a collection still carries. A helper inverts it —
  the module decides what to read and what to say about it.

## Consequences

codegraph runs code from the repo it is reading, which it never did before. It
runs only a file the repo's own tags point at, gives it 30 seconds, and reads
only its JSON. A helper that fails, times out, prints nothing useful or needs
credentials the machine has not got leaves the shape unknown and says why on the
map; it never stops the map being drawn, and `CODEGRAPH_NO_HELPERS=1` stops any
of them running.

A helper is the shape when it answers, so a store with both a helper and a
readable schema shows what the helper said. Only the module that owns the store
may hold its shape; any other naming it is a mismatch.
