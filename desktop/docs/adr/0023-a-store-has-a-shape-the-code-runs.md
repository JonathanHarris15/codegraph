# 23. A store has a shape the code runs

Date: 2026-11-09

## Status

Accepted.

## Context

A software system that keeps things in a database shows that database today
as one card with a list of store names on it, and a `keeps` wire from each
module that owns one. That is all. What a store holds, which stores live
inside which, and which point at which, are nowhere on the map, and none of
it can be drawn on a sketch.

Mosaic is the case that makes this matter. It keeps about 60 Firestore stores
(Firestore calls them collections). Some live inside each record of another:
each person has their own `involvement`, `away` and `prayer_requests`. Many
point at others by id: a roster entry holds a `personId`. Firestore records
none of this. It saves any field it is sent, the store names are typed out by
hand some 650 times, and the links live only in the code and the ADRs. A typo
reads or writes an empty store without complaint.

Codegraph exists to hold software to a shape. A database whose shape nothing
holds is the clearest case of what it should catch, draw honestly, and help
put right.

The legacy codegraph settled where a shape comes from (legacy ADRs 0003 and
0006): only from something the program runs — a schema the code checks data
against, a model, a migration, a type — never from a comment, and never by
sampling the live data. That holds here.

## Decision

### Words

A Firestore collection, a SQL table and a folder of files on disk are all a
**store**, the word the glossary already has; "collection" stays on its
avoid list. A store holds **records**, each made of **fields**. Its **shape**
is the list of its fields and what each holds.

A store is **fixed** or **open**:

- **Fixed**: the shape lists every field a record may have. A record with any
  other field is wrong.
- **Open**: records may carry fields the shape does not list. The shape still
  says what any unlisted field holds — text, a number, a record of a given
  shape — or that it can hold anything, which the map marks as loose.

Fixed and open apply to any field that holds a record of its own, not only to
the store as a whole. A fixed `people` store can have an open `customFields`
map inside it. That is the natural shape of a document database: firm where
the code knows the keys, open where the people using the app add them.

An **inner store** lives inside each record of another and goes when its
record goes: `people/{id}/involvement`. A field that holds another record's
id **points at** that store.

### Where a shape is written

On the schema the owning module runs, which already carries the store's tag
(ADR 0008). The tag gains `inside` for an inner store, and `from` for the
schema file beside it, since a JSON file has no comment to carry a tag:

```js
// codegraph: store people in mosaic-db from people.schema.json
// codegraph: store involvement in mosaic-db inside people from involvement.schema.json
```

A schema file ends `.schema.json`, so the reader knows to read it.

The first schema the reader understands is JSON Schema, because it names no
language, the code can check writes against it at run time, and it already
says fixed or open: `additionalProperties: false` is fixed, and
`additionalProperties: { ... }` is open to what it describes. A field that
points at another store says so with `"pointsAt": "people"`, and its
`description` is the wire's words. Zod and TypeScript types come after, each
with its own reader, as languages do.

A store with no schema the reader can read is drawn with its shape unknown,
never guessed. Once a repo is set up, the check reports it.

### On the map

Opening a database card shows its stores as cards. A store card lists its
fields on its face, each with what it holds, and marks the ones that point
elsewhere. An inner store is drawn inside its store's card, as a card inside
a card, since it lives there and goes with it. A field that points at another
store is a `points at` wire: "roster points at people for who is serving".
A module's `keeps` wire reaches the store it owns, not just the database.

### On a sketch and a proposal

A person draws stores like any card inside a database: adds and edits fields
on the card, sets it fixed or open, draws one store inside another, and draws
a wire between two to say one points at the other. A snapshot of the map
carries every store as it stands. The proposal file lists the stores it adds,
changes or crosses out, each with its whole shape, and the built rule holds
the schema to it like everything else.

### What setup does, and what it does not

Setup reshapes the code, not the data. For each store it writes one schema in
the owning module, makes that module check every write against it, routes
every read and write through that module, and has the rest of the code take
the store's name from it instead of typing it out. The shape it writes is the
data as the code really writes it, spelled as it is stored, fixed only where
the code shows every field.

Changing what is stored — renaming a field, splitting a store, closing an open
one — changes records already in the database, so it needs a migration. That
is a sketch, made into a proposal that carries the migration, never part of
the setup sweep.

## Considered options

- **A list of stores and fields in `codegraph.config.json`.** One place to
  read, but nothing runs it, so it drifts the first time someone adds a
  field. It would also be a second description of the architecture, which
  ADR 0008 rules out.
- **Fields in tag comments.** Easy for any language; wrong for the same reason.
- **Sampling the live database.** Shows what is there, junk and all, needs the
  project's credentials and its people's data, and says nothing about what the
  code means to write.
- **A shape the code runs.** Chosen. It is what makes the map true and the
  database safer in the same change.
- **Fixing the data during setup.** Tempting for a repo like Mosaic, but setup
  is one unattended sweep, and a wrong migration loses people's records. Setup
  stays safe to rerun; data changes get a person's eyes, through a proposal.

## Consequences

The map can show a database as it is, inner stores and links included, and a
sketch can design the one it should become.

A repo like Mosaic gains about 60 schema files in setup, and its writes start
failing loudly where they used to save junk quietly. That is the point, but it
means setup must be run where the tests cover the writes, and its branch
tried before it is merged.

Each kind of schema needs its own reader. Until a repo's kind is read, its
stores show with their shape unknown.

A schema could later write the field checks in a database's own rules, such as
Firestore's security rules, so a write that skips the code is caught too. Not
part of this.
