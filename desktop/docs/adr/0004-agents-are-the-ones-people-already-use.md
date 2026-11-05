# Agents are the ones people already use

codegraph does not run agents. A person's own agent — Claude Code, Codex, or
whatever comes next — reaches codegraph through its MCP server, which holds
every instruction an agent needs (setup included), and reports there which
card it is working on so the canvas can show it. The workflow is the person
saying to their agent: take this sketch, make it the proposal on this branch,
then build it.

Running an agent from inside the app would make "hand it off and walk away"
easier, but it would tie codegraph to particular agents, need the person's
API keys, and change code where nobody is watching.
