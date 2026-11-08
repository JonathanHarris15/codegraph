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
| `store X as Y` | `store X in <the container it is kept in>` |
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

## 6. Check, and hand it over

- Run the repo's own tests and type checks. Setup must not break them.
- Call `check` and fix what it lists, until it lists nothing.
- Commit everything on the branch in one commit, `Set up codegraph`.
- Tell the person, plainly: the containers you found, what you moved and
  why, anything you left alone and why, and that merging the branch
  finishes it.
