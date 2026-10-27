---
name: setup
description: Set a repo up for codegraph. Tags every source file, writes the architecture rules into the repo's CLAUDE.md, and hands back a ranked list of mismatches to fix.
disable-model-invocation: true
---

# Codegraph setup

Brings one repo, fresh or long-lived, under codegraph (docs/adr/0004 in the codegraph plugin). Setup changes no behaviour: it writes tags (comments), the repo's context block and a `.gitignore` line. Moving and rewriting code is the fix skill's job, one change at a time.

The program is `codegraph.py`, two folders above this skill's base directory. Call that path `CG` below and run it with Python 3.10 or newer. It reads Python on its own; TypeScript and JavaScript need `pip install tree-sitter tree-sitter-typescript tree-sitter-javascript`. If the repo has such files and the import fails, ask before installing.

## Steps

1. **Branch.** The working tree must be clean; if it is not, stop and ask. Create a branch `codegraph-setup` (prefix it if the repo's branches use one).

2. **Draft.** Run `python CG . --draft`. Every untagged source file gets a first tag, guessed from folders and imports: one module per folder, front doors holding what crosses today (leaving out what only tests use), tests and tooling by their names, UI by where frameworks put it. If an old `codegraph.json` is there, it seeded the modules; delete it once the tags are in.

3. **Correct every tag by judgment.** This is the work of setup; the draft knows folders, not purpose. Read the code behind each unit and make its tag a claim you would defend:
   - **Module**: deep code behind a small front door, and the only kind that touches stores and outside connections. Narrow each front door to what *should* cross, not what crosses today. For each name ask: *would I mind another module using this?* `bandOf`, no: it goes on the door. `dashArrayFor`, yes: two places deciding how a dashed line looks is how things drift apart, so it stays inside. A module's own tests are insiders and may use anything in it (docs/adr/0005), so never widen a door for a test.
   - **Feature**: one whole thing a person, a schedule or an event asks the app to do, thin, getting its power from modules. Name its system (`feature X in <system>`), its modules (`uses`), and its trigger (`schedule ...`, `event ... as <Schema>`, `command <name>` for a program a person runs at a terminal, or a page that imports it). Code that is a feature but sits in a module folder gets a feature tag where it stands; moving it is a fix.
   - **Page / start page / component / design system / shell**: a page is a *place* a person lands, with its own address (`at /route` where the framework does not give one). A panel drawn inside a page is a component, even when it sits in a `pages/` folder: folder names are a poor guide. A component is UI used on more than one page, which may pull data; the design system pulls none. The shell is the frame every page sits in, such as the app's nav bar and router: tag it `shell`, and its links count from every page. Mark one start page.
   - **Store**: tag `store <name>` on the schema that defines it, in its owning module; other modules that read it say `reads <name>`. If the schema is built while the program runs, from a list the code already keeps, name it with `as <Schema>` and leave it built: its shape shows as unknown, which is fine, and a second hand-written copy is worse.
   - **Test**: `test module <m>`, `test feature <f>`, or `test ui <pages it walks>`. Where a test must fake the repo's own code because the test runtime lacks something (jsdom has no canvas), say so: `fakes <what> because <what is missing>`. Fake data that ships with the program (fixtures under `src/`) belongs with the tests; the check lists a file only tests reach.
   - **Tooling**: builds, configures or runs the program but is not part of it. A program a person runs to do real work, such as a migration, is a feature with a `command` trigger, not tooling.

   Done when every file's tag is one you would defend. The mismatches left are then the code's to fix, not the tags': a door narrowed to what should cross will show red where other code reaches past it, and that red is correct.

4. **Context block.** Put the block in [CONTEXT-BLOCK.md](CONTEXT-BLOCK.md) into the repo's `CLAUDE.md`, between its `<!-- codegraph:start -->` and `<!-- codegraph:end -->` markers: replace an existing block, else append it, else create the file. Use `AGENTS.md` instead if the repo keeps its agent rules there.

5. **Ignore the drawn map.** Add `.codegraph/` to `.gitignore`.

6. **Commit** on the branch: `Set up codegraph: tag every file`.

7. **Report.** Run `python CG . --check` and group the mismatches, worst first:
   1. layers broken: a module calling a feature or the UI, a feature or page reaching a store or an outside connection, a feature calling a feature;
   2. front doors crossed;
   3. stores with no schema, readers undeclared;
   4. features with no trigger, pages unreachable or walked by no UI test;
   5. tests faking the repo's own code.

   Tell the person how many of each, the three to fix first and why, that `/codegraph` shows the map beside the chat, and that `/codegraph:fix` fixes the next one.
