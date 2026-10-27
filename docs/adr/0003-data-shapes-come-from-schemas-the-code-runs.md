# Data shapes come from schemas the code runs

The graph shows what data looks like: the fields in a NoSQL collection, the
tables in a SQL database, what an API request or webhook carries in. A shape
on the graph is read only from something the program itself uses: a database
model, a migration, a schema the code checks data against, or a type on the
code that receives a request. Never from a comment.

The module that owns a store or receives an event holds that schema, and the
schema carries the store's tag, so the module is what keeps its part of the
graph true. Change the schema and the graph changes with it; there is nothing
else to update.

Where a module writes loose data with no schema at all, as code often does
against a NoSQL database, the fix is to add one that the module really
checks its data against; setup lists it as a mismatch (ADR 0004). That makes the code safer and the graph true at the same time.

## Considered options

- **Describe shapes in tag comments.** Easy to write, and wrong the first
  time someone adds a field without editing the comment.
- **Sample the live database.** Shows what is there today, including old
  junk, needs credentials, and says nothing about what the code expects.

## Consequences

Each kind of schema needs its own reader (an ORM model, a validator library,
a SQL migration, a TypeScript type), the same way each language has one. A
schema codegraph cannot read is shown as a store with an unknown shape, not a
guessed one. That includes a schema built while the program runs, such as a
zod object made from a catalogue of columns: `store sales as SaleColumns`
names it, codegraph finds it defined in the module, and lists the shape as
unknown rather than red. Building it from the one list is the better design,
and the check must not push toward writing a second.

Amended by docs/adr/0006: where the fields are not in the code to read at all,
the owning module may hold a shape helper — a file it runs to print the shape —
rather than leaving the store unknown. The rule here is unchanged; a helper is
something the program runs, not a comment.
