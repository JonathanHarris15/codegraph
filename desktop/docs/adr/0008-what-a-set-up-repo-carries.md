# 8. What a set-up repo carries

Date: 2026-11-02

## Status

Accepted.

## Context

Every set-up repo will carry these rules, so changing them later means
changing every repo. The map is read from them (ADR 0003), the check holds
code to them, and setup writes them in one sweep.

The legacy codegraph settled one thing worth keeping: the code says what it
is, in a tag near the top of each file, and there is no second file
describing the architecture that drifts from it (legacy ADR 0002). What it
did not have is containers, projects, or words on wires.

Some facts are not in any one file: which projects a repo serves (ADR 0006),
which containers it has, and containers with no code in the repo at all,
like a database.

## Decision

A set-up repo carries two things: one config file at its root, and tags in
its files.

### The config: `codegraph.config.json`

It holds only what no single file can say. It is not called
`codegraph.json`: the legacy codegraph once used that name for a file setup
now deletes, and the two must never be mistaken for each other.

```json
{
  "projects": ["harris-appraisals", "mosaic"],
  "containers": {
    "web": {
      "kind": "browser app",
      "says": "Where appraisers fill in and send their reports",
      "folders": ["app"]
    },
    "notes-db": {
      "kind": "database",
      "says": "Keeps every report and its photos"
    }
  }
}
```

- **projects** names each project the repo serves, by a short name that
  stays put when the project is renamed in the app.
- **containers** names each container, its kind, a line saying what it is
  for, and the folders its code lives in. A kind is a few plain words:
  browser app, server, desktop app, database, files on disk, function,
  command-line tool. A container with no code here, such as a database, has
  no folders.

Every file tagged as part of a component sits under exactly one container's
folders; one that sits under none, or two, is a mismatch. Tests and tooling
are the exception: they often live in their own folders, like `test/` or
`cypress/`, and a test belongs to whatever it tests.

### Tags

A tag is one comment line that starts with `codegraph:`, in whatever comment
the language uses. A file's tag sits near its top and says which component
it belongs to. A component of several files is those files carrying the same
tag.

```ts
// codegraph: module notes
// codegraph: front door saveNote, listNotes, Note
// codegraph: store notes in notes-db
// codegraph: feature write-note uses notes, people
// codegraph: page note at /notes/:id
// codegraph: start page notes at /
// codegraph: trigger nightly-tidy schedule
// codegraph: test feature write-note
// codegraph: tooling
```

- **module**, **feature**, **page**, **trigger** say which kind of component
  the file belongs to, and its name. A trigger says whether it is a
  schedule, an event or a command.
- **as** after a component's name says what the team calls it: `module jobs as
  queue`. It is what the map shows. The rules a component keeps to still come from
  its kind, so the check holds whatever it is called (ADR 0013).
- **front door** is written once per module and lists what other components
  may use.
- **uses** on a feature names the modules it gets its power from.
- **store** goes on the schema that defines what is kept, in the module that
  owns it, and names the container it is kept in: a database, or files on
  disk.
- **at** on a page gives its address where it has one; a desktop app's pages
  may have none. **start page** marks where a person lands.
- **test**, **fakes**, **shape of** and **tooling** carry over from legacy
  unchanged.

Code, the bottom level, needs no tags: the reader finds the names inside
each file itself.

### Words on wires

The kind of a wire is read from the code. Its words are written beside the
line that makes it, after `codegraph: wire`:

```ts
import { saveNote } from '../modules/notes' // codegraph: wire keeps the note
await fetch(stripeUrl, body) // codegraph: wire to stripe: takes the payment
```

Where the reader can see what the line reaches, as with an import, only the
words are needed. Where it cannot, as with a call to another software system
or a shallow one, `to <name>:` says what it reaches. A wire's words are
written once, on any one line that makes it. A wire with no words, or with
two sets that disagree, is a mismatch.

Wires between containers and between software systems are not written down:
the map draws them from the wires between their components.

### Shared parts of pages

A part of a page that more than one page shows, and the design system, are
modules. They do one job behind a front door like any other module; they
just happen to draw things.

### Carrying legacy tags over

Setup translates the tags whose meaning holds and deletes the rest of the
legacy residue:

| Legacy | New |
| --- | --- |
| `module`, `front door` | the same |
| `feature X in S uses …` | `feature X uses …` (the repo is the system now) |
| `page`, `start page` | the same |
| `component X`, `design system` | `module X`, `module design-system` |
| `store X as Y` | `store X in <container it is kept in>` |
| `test`, `fakes`, `shape of`, `tooling` | the same |

## The proposal on a branch

Added with checkpoint 4. A branch with a proposal (ADR 0007) carries a third
thing: `codegraph-proposal/proposal.json`, with its mockups as pictures
beside it. Deleting the folder ends the proposal.

It lists only what changes, each card by the name a person reads it by: a
container by its name, `web`; a component by its container, kind and name,
`web/page search`. A wire names its two ends, its kind and its words; a wire
between containers stands for any wire between what they hold. Anything
marked `"gone": true` is crossed out. It also says what it is for, the sketch
it came from, the commit it was drawn on, and where a person put each card
while drawing it.

The check holds the code to it like a failing test: it fails while anything
drawn is missing, anything crossed out is still there, or anything changed
since that commit that the proposal does not draw; and once all of that is
true, it fails until the folder is deleted in the same change.

Names, not ids, because an agent writes and reads this file as often as the
app does, and a name is what the tags already say.

## Considered options

- **Containers by tag on every file**, `module notes in web`. Nothing outside
  the files, but the container repeats on every file, and a database has no
  file to carry it.
- **Containers by folder, in the config.** Chosen. A repo has few containers
  and they rarely move; the check catches a file outside them.
- **Words on wires in the config.** One place to read, but a list beside the
  code is exactly what drifts.
- **Words on wires beside the line that makes them.** Chosen. Moving or
  deleting the line moves or deletes the words.

## Consequences

Two places say things about a repo: the config for the few facts that span
files, the tags for everything else. The check reads both and holds them to
each other.

Renaming a project in the app does not touch any repo, because repos name
it by its short name.

The reader can map a repo it has never seen as soon as it has these two
things, at any branch or commit.
