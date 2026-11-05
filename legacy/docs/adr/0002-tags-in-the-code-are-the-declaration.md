# Tags in the code are the declaration

codegraph used to read a separate file, `codegraph.json`, that said what the
code was meant to be, and checked the code against it. That file is a
documentation layer, and like any one it drifts from the code it describes.
We drop it. Every source file now says what it belongs to in a tag: one
comment line near its top that starts with `codegraph:`. A module of several
files is those files carrying the same tag.

```python
# codegraph: module engine
# codegraph: front door Book, tick
```

```ts
// codegraph: feature plan-service in calendar
// codegraph: uses services, members
```

```ts
// codegraph: page order-of-service
// codegraph: component people-picker
// codegraph: design system
// codegraph: tooling
```

The tag is the intent; the rest of the file is what the code really does.
The check compares the two, so the graph can still show a mistake: a module
whose files import a feature, a page that reaches past a feature to a module,
a name used from outside that is not on the front door. A source file with no
tag belongs to nothing and is itself a mismatch.

A module's front door is written once, on one of its files. A feature names
its system and the modules it uses. Stores are tagged on the schema that
defines them (ADR 0003). Tests say which kind they are and what they test.

## Considered options

- **Keep `codegraph.json`.** One place to read, but a second copy of the
  architecture that nobody edits when they move code.
- **Folders, with tags only where a framework decides where files go.** Clean
  on a fresh project, but Next.js, Django and Rails all place pages for you,
  so most real projects would need tags anyway, and two ways to say the same
  thing means two readers and two sets of bugs.
- **Tags everywhere.** Chosen. One rule for every project and every language.
  Folders go back to being a matter of taste.

## Consequences

A tag is a comment, so every language can carry one, and reading tags needs
no parser: it happens before a file's reader runs.

Setup writes the first tags (ADR 0004); after that, whoever writes the file
keeps its tag true, which the context file tells agents to do.

`--draft` writes tags into files instead of a JSON file, and `--check` reads
tags. An old `codegraph.json` seeds the first draft and can then be deleted.
