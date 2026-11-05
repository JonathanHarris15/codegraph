<!-- codegraph:start -->
## Codegraph

This repo is set up for codegraph: its architecture is read from its code.
`codegraph.config.json` names its containers and the projects it serves,
and every code file carries a `codegraph:` tag saying which component it
belongs to. There are no architecture docs to keep up; the tags are them.

How to work here:

1. **Look first.** Call the codegraph `map` tool to see the containers,
   components and wires before deciding where a change goes. Put each piece
   of work in the component it belongs to, not where it is quickest to write.
2. **Keep the kinds apart.** Only a module touches stored data or anything
   outside its container. A feature is thin and names the modules it `uses`.
   A page hands what a person sets off to a feature. A trigger starts a
   feature from a schedule, an event or a command.
3. **Keep tags true as you go.** A new file gets its tag when it is written.
   A new import from another component gets words saying what it is for:
   `// codegraph: wire <what it is for>`. A name other components take goes
   on its module's front door. Call the `instructions` tool with topic `tags`
   for the full rules.
4. **Check before you finish.** Call the codegraph `check` tool. The work is
   done when it lists nothing you added. If the tool is missing, the
   codegraph MCP is not connected here: say so rather than skip it.
5. **A proposal is a failing test.** If `codegraph-proposal/` is on this
   branch, the person drew a change for you to build, and the check fails
   until it is built. Call the `instructions` tool with topic `proposals`
   for how to build one, and how to make one from a sketch.
<!-- codegraph:end -->
