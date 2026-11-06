# Codegraph's tags and config

A repo set up for codegraph carries two things: `codegraph.config.json` at
its root, and a tag in every code file. The map is read from them, and the
`check` tool holds the code to them.

## The levels

- **Software system**: the whole repo.
- **Container**: a part of it that runs on its own (a browser app, a server,
  a desktop app, a database, files on disk, a function, a command-line tool).
- **Component**: one part of a container that does one job behind a clear
  front. Every component is one of four kinds:
  - **module**: does real work behind a small front door. Only a module
    touches stored data or anything outside its container. A part more than
    one page shows, and the design system, are modules too.
  - **feature**: one thing a person, a schedule or an event asks for. Thin;
    gets its power from the modules it names in `uses`.
  - **page**: what a person sees and acts through. What a person sets off on
    a page is handed to a feature; a page never does the job itself.
  - **trigger**: starts a feature without a page: a schedule, an event from
    outside, or a command someone types.
- **Code**: the files of a component and the names in them. No tags needed.

## The config

```json
{
  "projects": ["notes-app"],
  "containers": {
    "web": { "kind": "browser app", "says": "Where people keep their notes", "folders": ["app"] },
    "db": { "kind": "database", "says": "Keeps every note" }
  }
}
```

- `projects`: the short name of each project the repo serves.
- `containers`: each one's kind, one line on what it is for, and the folders
  its code lives in. A container with no code here, like a database, has no
  folders. Every component file sits under exactly one container's folders.
  Tests and tooling may sit anywhere.

## Tags

One comment line near the top of each file, starting `codegraph:`, in
whatever comment the language uses. Files with the same tag make one
component.

```ts
// codegraph: module notes
// codegraph: front door saveNote, listNotes, Note
// codegraph: store notes in db
// codegraph: feature write-note uses notes, people
// codegraph: page note at /notes/:id
// codegraph: start page notes at /
// codegraph: trigger nightly-tidy schedule        (or event, or command)
// codegraph: test feature write-note              (test module x, test page y…)
// codegraph: tooling                              (config, build scripts, helpers for tests)
```

- `as <type>` says what the team calls a component, after its name: `module
  jobs as queue`, `feature send as webhook uses mail`, `page home as landing at
  /`, `trigger tidy schedule as cron`. It changes what the map calls it, never
  which rules it keeps to: those come from module, feature, page or trigger.
- `front door` goes once per module and lists every name other components
  may take from it.
- `uses` on a feature lists exactly the modules it imports.
- `store` goes on the schema that defines what is kept, in the module that
  owns it, and names the container it is kept in.
- `at` gives a page its address where it has one. `start page` marks where a
  person lands.
- `fakes <what> because <why>` and `shape of <store>` may also appear.
- Type declaration files (`.d.ts`) need no tag.

## Words on wires

The kind of a wire is read from the code. Its words, saying what it is for,
are written at the end of the line that makes it:

```ts
import { saveNote } from '../modules/notes' // codegraph: wire keeps the note
await fetch(stripeUrl, body) // codegraph: wire to stripe: takes the payment
```

Every import from one component into another needs words, written once on
any one line that makes that wire. A call out of the repo says what it
reaches with `to <name>:`, and only a module may make one.

## What the check holds you to

- Every code file is tagged; every component file is inside one container.
- Every wire between components has words.
- A module never reaches a feature, a page or a trigger. A feature never
  reaches a page or a trigger. Nothing reaches into a page or a trigger.
- A feature's `uses` names exactly the modules it imports.
- Names taken from a module are on its front door.
- Only a module calls out of the repo, and only a module keeps a store.
