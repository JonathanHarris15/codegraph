<!-- codegraph:start -->
## Architecture: codegraph

This repo is built in three layers, and every source file says in a `codegraph:` tag near its top which one it belongs to. The code is the architecture: there are no separate architecture docs to update.

- **Modules** do the real work behind a small front door. Only a module touches a store (a table or collection) or an outside connection (an API, a feed, the environment). A module never calls a feature or the UI.
- **Features** are the things a person, a schedule or an event asks the app to do. Each is thin, belongs to one system, and gets its power from the modules it names in `uses`.
- **UI** is how a person reaches features: pages, components (used on more than one page, may pull data) and the design system (pulls no data). The UI acts on features and may show what a module's front door offers.

How to work here:

1. **Sort the request.** Whatever words it comes in, decide what it is: a new or changed feature, module, page, component, or a mix. Read the map first with the `mcp__codegraph__map` tool, and put each piece of work in the layer it belongs to, not where it is quickest to write.
2. **Test first, at that layer's seam.** A module test may use anything inside its own module, with real stores where that is cheap and fakes only for outside connections; anything from another module goes through that module's front door. A feature test starts the feature the way its trigger would, runs the real modules, and checks what the trigger gets back. A UI test is a click-through that runs in a browser and walks the pages it names. Fake only what is outside the program, never the repo's own code; where the test runtime lacks something the code needs (jsdom has no canvas), say so in a `codegraph: fakes <what> because <why>` tag.
3. **Keep tags true.** A new file gets its tag when it is written. A new name that other code may use goes on its module's front door; a feature that starts using a module adds it to `uses`; a new store's tag goes on its schema.
4. **Check before you finish.** Run the `mcp__codegraph__check` tool after every change. The work is done when it lists no mismatch you added. If the tool is missing, the codegraph plugin is not installed here: say so rather than skip the check.

To clean up what the map already shows red, use the `codegraph:fix` skill.
<!-- codegraph:end -->
