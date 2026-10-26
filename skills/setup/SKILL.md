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

2. **Draft.** Run `python CG . --draft`. Every untagged source file gets a first tag, guessed from folders and imports: one module per folder, front doors holding what crosses today, tests and tooling by their names, UI by where frameworks put it. If an old `codegraph.json` is there, it seeded the modules; delete it once the tags are in.

3. **Correct every tag by judgment.** This is the work of setup; the draft knows folders, not purpose. Read the code behind each unit and make its tag a claim you would defend:
   - **Module**: deep code behind a small front door, and the only kind that touches stores and outside connections. Narrow each front door to what *should* cross, not what crosses today; the excess shows red, and that is correct.
   - **Feature**: one whole thing a person, a schedule or an event asks the app to do, thin, getting its power from modules. Name its system (`feature X in <system>`), its modules (`uses`), and its trigger (`schedule ...`, `event ... as <Schema>`, or a page that imports it). Code that is a feature but sits in a module folder gets a feature tag where it stands; moving it is a fix.
   - **Page / start page / component / design system**: a page is a place a person lands (`at /route` where the framework does not give one); a component is UI used on more than one page, which may pull data; the design system pulls none. Mark one start page.
   - **Store**: tag `store <name>` on the schema that defines it, in its owning module; other modules that read it say `reads <name>`.
   - **Test**: `test module <m>`, `test feature <f>`, or `test ui <pages it walks>`.
   - **Tooling**: builds, configures or runs the program but is not part of it.

   Done when every file's tag is one you would defend, and every mismatch `python CG . --check` lists is a real problem in the code, not a wrong tag.

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
