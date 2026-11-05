<!-- Legacy: the first codegraph, the Claude Code plugin. Kept working; new
work happens in ../desktop. Changes here are fixes, not features. -->

# codegraph

The words are in `CONTEXT.md`; decisions in `docs/adr/`.

<!-- codegraph:start -->
## Architecture: codegraph

This repo is built in three layers, and every source file says in a `codegraph:` tag near its top which one it belongs to. The code is the architecture: there are no separate architecture docs to update.

- **Modules** do the real work behind a small front door. Only a module touches a store (a table or collection) or an outside connection (an API, a feed, the environment). A module never calls a feature or the UI.
- **Features** are the things a person, a schedule or an event asks the app to do. Each is thin, belongs to one system, and gets its power from the modules it names in `uses`.
- **UI** is how a person reaches features: pages, components (used on more than one page, may pull data) and the design system (pulls no data). The UI acts on features and may show what a module's front door offers. What runs when a person clicks, submits or picks is a feature's work: the page hands it to a feature and shows the answer, and never does the job itself.

How to work here:

1. **Sort the request.** Whatever words it comes in, decide what it is: a new or changed feature, module, page, component, or a mix. Read the map first with the `mcp__codegraph__map` tool, and put each piece of work in the layer it belongs to, not where it is quickest to write.
2. **Test first, at that layer's seam.** A module test may use anything inside its own module, with real stores where that is cheap and fakes only for outside connections; anything from another module goes through that module's front door. A feature test starts the feature the way its trigger would, runs the real modules, and checks what the trigger gets back. A UI test is a click-through that runs in a browser and walks the pages it names. Fake only what is outside the program, never the repo's own code; where the test runtime lacks something the code needs (jsdom has no canvas), say so in a `codegraph: fakes <what> because <why>` tag.
3. **Keep tags true.** A new file gets its tag when it is written. A new name that other code may use goes on its module's front door; a feature that starts using a module adds it to `uses`; a new store's tag goes on its schema. Where a store's fields are not in the code to read — a catalogue the people using the app add to and switch on and off, or anything else an outside source decides — the owning module holds a **shape helper**: a file of that module tagged `codegraph: shape of <store>` which prints the shape as JSON when it is run, `{"name": "Sale", "fields": {"saleNo": "text"}}`. codegraph runs it and takes it at its word, so the map shows real fields instead of an unknown shape. That is how a module informs the shape of anything it does not declare itself; never write the fields into a comment, and never keep a second hand-written list beside the one the program uses.
4. **Check before you finish.** Run the `mcp__codegraph__check` tool after every change. The work is done when it lists no mismatch you added. If the tool is missing, the codegraph plugin is not installed here: say so rather than skip the check.

To clean up what the map already shows red, use the `codegraph:fix` skill. When someone describes something new to build, or hands over a ticket, use `codegraph:plan` to put it on the map as a plan they approve before you build it; a plan waits in `plans/` and is deleted once it is built.
<!-- codegraph:end -->

## The app this was tried against

The notes app that lived in `tests/indie-stack` has moved out to its own repo beside this one, `../../indie-stack`, where the new codegraph is being worked out. Nothing here depends on it any more: `tests/test_example.py`, which kept it clean, went with it. Point codegraph at it by path to try something: `python codegraph.py ../../indie-stack --check`.
