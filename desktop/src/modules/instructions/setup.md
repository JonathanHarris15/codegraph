# Setting a repo up for codegraph

Setting up makes a repo's code show its own architecture: a config naming
its containers and projects, the code reshaped to fit codegraph's kinds of
component, a tag in every file, and words on every wire. Do it in one clean
sweep, on one branch, and leave nothing of the old setup behind.

Read the rules first: call `instructions` with topic `tags`. Everything
below assumes them.

## 0. Before you touch anything

- Make sure the working tree is clean, and cut a branch:
  `codegraph-setup`. All of setup lands on it as one change the person
  merges.
- Call `check` and `map` to see where the repo stands. A repo with no config
  shows nothing yet; that is expected.
- Find out which project or projects this repo serves. If the person has not
  said, ask them for the short name (like `harris-appraisals`). This is the
  one question worth stopping for.

## 1. Survey, on your own

Read the whole repo before changing any of it. Decide:

- **Containers**: each part that runs on its own. A browser app, a server, a
  worker, a database, files on disk. Name each, give its kind and one line
  on what it is for, and the folders its code lives in. A repo is often one
  app container plus one database.
- **Components**: sort every code file into a module, a feature, a page, a
  trigger, a test or tooling. Name components by what they do, in the
  repo's own words.
- **Types**: where the team already has a word for a kind of thing — a
  queue, a gateway, a worker — write it after the component's name with
  `as`: `module jobs as queue`. The map draws it as that, and the word
  reaches the person's card library. The four kinds still say which rules
  the component keeps to.
- **Stores**: every kind of thing the repo keeps, in each database or folder
  of files, which stores live inside the records of another, and which module
  should own each one. Section 2b says what each gets.
- **What it reaches outside**: every call out of a container — another
  system, somebody else's API — gets `wire to <name>:`. Name the system the
  way a person would say it, not the library or the URL: the app offers that
  name to the person as a shallow software system, and it becomes a card on
  their map.
- **Reshaping**: list every place the code breaks the rules. The usual ones:
  - a page that talks to the database or an outside service itself. Pull the
    work out into a feature, and the storage or outside call into a module.
  - a page or feature that calls out of its container. Move the call into a
    module.
  - a helper used by many pages. Make it a module with a front door.
  - a module that imports a feature or a page. Turn the import around.
- Write `codegraph.config.json`.

## 2. The sweep, in parallel

Split the repo into slices that do not share files, one per container or per
folder, and hand each slice to its own sub-agent at once. Give each one:

- the rules (the `tags` instructions, in full),
- the config you wrote and the component names you chose for everything,
  including other slices, so names and wires agree across them,
- its list of reshapes, and the files it owns. It touches no other files.

Each sub-agent reshapes its slice, tags every file, writes the front doors
and `uses`, and puts words on every import between components. Reshaping
only moves code; it never changes what the program does. If a reshape is
risky or unclear, the sub-agent leaves it, says why, and tags the code as it
is.

Three things every sub-agent gets wrong unless it is told, so tell it:

- A wire's words go on the line the import **starts** on, or on a line of
  their own directly above it. On a multi-line import they do not go on the
  closing `} from '...'` line, where the reader will not find them.
- A default export goes on the front door as the word `default`, not under
  the module's name: `front door default, saveNote`.
- A `require` or an `await import(...)` is an import like any other, with its
  words on the line its statement starts on.

## 2b. Stores, and the shape of what they keep

Every store gets a schema the module that keeps it runs, named in its tag with
`from`. Where the database already runs one, as a SQL database through Prisma
does, name that model and write nothing new: `store notes in db from
../../prisma/schema.prisma#Note`. Give its foreign keys `///` words saying what
they are for, which are only comments and change no table. Everywhere else,
write a JSON Schema file beside the tagged file, which the module checks
every write against. The map draws each store's fields from it, and the check
reports any store without one. Do this for every database and every folder of
files the repo keeps things in.

Setup reshapes the code, never the data. What is already stored stays exactly
as it is, so the schema describes the records as the code really writes them:

1. **Find every store.** Search for every place the code names one: a
   collection, a table, a folder of files. In a document database these names
   are often typed out by hand all over the code; find them all, including
   spelling slips, which quietly read or write an empty store. A store that
   lives inside each record of another (a sub-collection) is an inner store:
   `store involvement in db inside people`.
2. **Give each one a module.** Only that module reads and writes it. Move every
   other read and write into it, behind its front door, and have the rest of
   the code take the store's name from it instead of typing it out.
3. **Write its schema from the writes.** Read every place a record of it is
   written and list each field the code sets, with what it holds. A field every
   write sets goes in `required`. A field that holds another record's id gets
   `"pointsAt": "<store>"` and a `description` saying what it is for: that
   description is the wire's words on the map. Spell each field as it is
   stored, even where the name is odd: renaming it changes the data.
4. **Fixed only where the code proves it.** Set `"additionalProperties": false`
   only when every write goes through code you can read and sets no other
   field. Where people using the app add fields of their own, or old records
   may hold fields the code no longer writes, leave it open and say what
   other fields hold: `"additionalProperties": { "type": "string" }`.
5. **Check every write against it.** The module validates each record before
   it writes it, with whatever JSON Schema validator the repo already has, or
   a small one added for it. A write that does not fit fails loudly instead of
   saving quietly. This is the point of the schema, and why setup must run
   where the tests cover the writes: run them, and fix the schema, not the
   test, where a real write does not fit.

What setup does not do: rename fields, split or merge stores, close an open
store, or touch a single stored record. Each of those changes the data, and
needs a migration a person can look at first. List them for the person
instead, as changes worth sketching; they become proposals.

Give each store's schema to the sub-agent whose slice holds the module that
keeps it, along with every place outside its slice that writes that store.

## 3. Clear out the old codegraph

Delete everything the legacy codegraph plugin left behind:

- the block between `<!-- codegraph:start -->` and `<!-- codegraph:end -->`
  in `CLAUDE.md` or `AGENTS.md` (the new block replaces it),
- `codegraph` in `.claude/settings.json` (`enabledPlugins` and any
  marketplace entry), keeping everything else in the file,
- the `plans/` and `.codegraph/` folders, and an old `codegraph.json`.

Carry over legacy tags whose meaning holds, rather than writing them again:

| Legacy | New |
| --- | --- |
| `module`, `front door` | the same |
| `feature X in S uses …` | `feature X uses …` |
| `page`, `start page` | the same |
| `component X`, `design system` | `module X`, `module design-system` |
| `store X as Y` | `store X in <the container it is kept in> from <its schema>` |
| `test`, `fakes`, `shape of`, `tooling` | the same |

`schedule`, `event` and `command` tags become `trigger <name> schedule`, and
so on. `shell` code belongs to whichever component it wires up, or is
`tooling` if it only starts the program.

## 4. Teach your own context file

Write the codegraph block into the repo's agent context file, `CLAUDE.md`
or `AGENTS.md`, whichever it uses (make `CLAUDE.md` if it has neither). Call
`instructions` with topic `working-here` for the block, and paste it in
whole. This changes the instructions you and every later agent work under
in this repo; that is the point.

## 5. Screenshots for the page map

If the repo has tests that click through its pages, have them save a
picture of each page they reach to `codegraph-screenshots/<page name>.png`,
named after the page component. Add `codegraph-screenshots/` to
`.gitignore`. The map shows these on the page map.

## 6. The design system

If the repo has a browser app, set its design system up in this same sweep,
as a slice of its own sub-agent: its tokens in `DESIGN.md`, the theme made
from them, its UI blocks and their states, its recipes, and the page the
live view opens. Call `instructions` with topic `design-system` for how, and
hand that sub-agent the whole of it. Like the rest of setup, it records how
the app looks now and changes nothing a person sees.

## 7. Check, and hand it over

- Run the repo's own tests and type checks. Setup must not break them.
- Call `check` and fix what it lists, until it lists nothing but exceptions
  a line gives a reason for.
- Commit everything on the branch in one commit, `Set up codegraph`.
- Tell the person, plainly: the containers you found, what you moved and
  why, anything you left alone and why, and that merging the branch
  finishes it. Name the stores you left open, and the changes to stored data
  worth making — misspelt fields, stores to split or close — as sketches for
  them to draw and hand back as proposals.
