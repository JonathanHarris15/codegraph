# Codegraph's tags and config

A repo set up for codegraph carries two things: `codegraph.config.json` at
its root, and a tag in every code file. The map is read from them, and the
`check` tool holds the code to them.

## The levels

Codegraph follows C4, from the outside in.

- **Project**: the outermost thing, one or more software systems people work
  on as one. It lives in the app, not in any repo. A repo names the projects
  it serves by their short name, and may serve more than one.
- **Person**: someone who uses the software. No code says who they are, so
  people are drawn in the app, never read or tagged.
- **Software system**: the whole repo. Yours is the only one you tag.
- **Shallow software system**: something the project leans on that has no
  repo here, usually because someone else runs it. A call out of your
  container names one (see Words on wires); it only reaches the map once a
  person agrees to it.
- **Container**: a part of the system that runs on its own (a browser app, a
  server, a desktop app, a database, files on disk, a function, a
  command-line tool).
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
- `"dev"` on a container, where it has a dev server: the address it answers
  at on this computer, as `"dev": "http://localhost:5173"`. The live view
  shows UI blocks from it. Only an address on this computer is taken.

A kind is a few plain words. The ones the app draws from the start are
browser app, server, desktop app, database, files on disk, function and
command-line tool; any other words are a type of the team's own, and the app
draws a card for it.

## Tags

One comment line near the top of each file, starting `codegraph:`, in
whatever comment the language uses. The whole line must be that comment and
nothing else. Files with the same tag make one component.

```ts
// codegraph: module notes
// codegraph: front door saveNote, listNotes, Note
// codegraph: store notes in db
// codegraph: feature write-note uses notes, people
// codegraph: page note at /notes/:id
// codegraph: start page notes at /
// codegraph: trigger nightly-tidy schedule        (or event, or command)
// codegraph: test feature write-note              (test module x, test page y...)
// codegraph: tooling                              (config, build scripts, helpers for tests)
```

- `as <type>` says what the team calls a component, after its name: `module
  jobs as queue`, `feature send as webhook uses mail`, `page home as landing at
  /`, `trigger tidy schedule as cron`. It changes what the map calls it and the
  card it is drawn as, never which rules it keeps to: those come from module,
  feature, page or trigger. Use the team's own word where they have one.
- `front door` goes once per module and lists every name other components
  may take from it. A default export goes on it as the word `default`, not
  under the module's name, because that is the name the code takes:
  `front door default, saveNote`.
- `uses` on a feature lists exactly the modules it imports.
- `store` goes on the schema that defines what is kept, in the module that
  owns it, and names the container it is kept in. Two more words may follow,
  in this order. `inside <store>` marks an inner store, one that lives inside
  each record of another and goes with it, like each person's own prayer
  requests: `store prayer_requests in db inside people`. Name an inner store's
  store by its path, `people/involvement`. `from <file>` names the JSON Schema
  the module checks what it keeps against, beside the tagged file and ending
  `.schema.json`: `store people in db from people.schema.json`. The map reads
  the store's fields from it. `additionalProperties: false` makes a shape
  fixed; without it the shape is open. A field holding another record's id
  says `"pointsAt": "<store>"`, and its `description` is the wire's words. A
  store with no `from` shows with its shape unknown. Where the database already
  runs a schema that says the store's shape, name that instead of writing a
  second one: a Prisma model is `from ../../prisma/schema.prisma#Note`, the file
  beside the tagged one and the model after `#`. A Prisma relation's `fields`
  column points at the store its model shapes, and `///` words above a field
  are the wire's words.
- `at` gives a page its address where it has one. `start page` marks where a
  person lands.
- `fakes <what> because <why>` and `shape of <store>` may also appear.
- Type declaration files (`.d.ts`) need no tag.

The design system adds a few more (call `instructions` with topic
`design-system` for how to set one up):

```tsx
// codegraph: page account at /account follows settings-page   (the recipe it follows)
// codegraph: ui block settings/SettingsRow    (beside the file's own tag; the folder, then the name it exports)
// codegraph: states SettingsRow               (a file of states for that block, instead of a component tag)
/* codegraph: theme */                         (beside its module's tag: the file that makes DESIGN.md's tokens)
color: '#ff6600' // codegraph: exception the brand logo's own orange
```

- `follows <recipe>` ends a page's tag: the recipe in `recipes/` it is laid
  out by.
- `ui block <folder>/<Name>` names a piece of screen in a component's file.
  Add one line per UI block the file holds.
- `states <Name>` is a file's whole tag: it renders each named state of one
  UI block, one export each, and is part of no component, like a test.
- `theme` marks the one file that turns DESIGN.md's tokens into CSS
  variables, `--colors-action` for `colors.action`.
- `exception <why>` goes at the end of a line, or on its own line above it,
  that breaks the design system on purpose. It must say why.

## Words on wires

The kind of a wire is read from the code. Its words, saying what it is for,
you write:

```ts
import { saveNote } from '../modules/notes' // codegraph: wire keeps the note
await fetch(stripeUrl, body) // codegraph: wire to stripe: takes the payment
```

**Which line.** The words go on the line the statement *starts* on, or on a
line of their own directly above it. On a multi-line import, that is the
`import {` line, never the closing `} from '...'` line. When the names are
spread over several lines, the tag on its own line above reads better:

```ts
// codegraph: wire lists the notes
import {
  listNotes,
} from '../modules/notes'
```

A `require` counts as an import, and so does `await import(...)`. The words
go on the line the statement starts on, the same way.

Every import from one component into another needs words, written once on
any one line that makes that wire. Two sets of words that disagree is a
mismatch.

**What reaches outside.** A call out of the container says what it reaches
with `to <name>:`, and only a module may make one. The name is not decoration:
the app offers it to the person as a shallow software system, and once they
agree it is a card on the map. So name the system, as a person would say it
— `to stripe:`, `to companies house:` — not the library, the URL or the
function.

**The kinds of wire.** The reader works these out; you never write a kind in
a tag. It helps to know what it will read:

| Kind | What makes it | Words |
| --- | --- | --- |
| `asks` | a page imports a feature | yours |
| `reads` | a page imports a module | yours |
| `starts` | a trigger imports anything | yours |
| `uses` | any other import between components | yours |
| `keeps` | a module's `store` tag, to the container it names | written for you |
| `leads to` | a page holding another page's address | read from the code |
| `calls` | a `wire to <name>:` tag | yours |
| `points at` | a field with `pointsAt` in a store's schema, to that store | the field's `description`, or its name |

## What the check holds you to

- Every code file is tagged; every component file is inside one container.
- Every `uses`, `asks`, `reads` and `starts` wire has words. `keeps` and
  `leads to` are written for you, so they need none.
- A module never reaches a feature, a page or a trigger. A feature never
  reaches a page or a trigger. Nothing reaches into a page or a trigger.
- A feature's `uses` names exactly the modules it imports, and no others.
- Every name taken from a module is on its front door, `default` included.
- Only a module reaches outside its container, and only a module keeps a
  store.
- Every store names its schema with `from`: a JSON Schema the module that
  keeps it checks every write against, or the Prisma model the database runs.
- Where the repo has a DESIGN.md: one file is tagged `theme` and matches it,
  token for token; no component's file uses a raw colour, or a raw size on a
  padding, margin, gap or radius, where a token belongs; and none uses a raw
  token a purpose token names. A line with an exception is listed apart, with
  why, and does not fail the check.
- A UI block is a name its file has, in a component; a states file is for a
  UI block there is.
- A page that follows a recipe uses every UI block its skeleton names; a
  recipe's reference is a page that follows it; a skeleton names only UI
  blocks.
