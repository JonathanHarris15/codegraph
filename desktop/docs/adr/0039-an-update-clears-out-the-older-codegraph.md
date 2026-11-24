# 39. An update clears out the older codegraph

Date: 2026-11-24

## Status

Proposed. Builds on ADR 0037, and on what a set-up repo carries (ADRs 0008,
0035).

## Context

Each release can change two things outside the app:

- **What Claude Code has on this computer.** 0.5 told people to add codegraph's
  MCP by hand, with `claude mcp add --scope user codegraph -- node …/mcp.js`.
  0.6 replaces that with the `codegraph-app` plugin (ADR 0037). Some people also
  still have the legacy plugin, `codegraph@codegraph`, turned on for
  themselves. An agent with two of these gets two codegraphs, and one with only
  the old MCP gets no skills at all.
- **What a set-up repo holds.** Setup in 0.6 moves `CONTEXT.md` and `docs/adr/`
  into `codegraph/` (ADR 0035). A repo set up before then still has a config
  and tags, so the app calls it set up, and nothing says its setup is behind.

The app already says when the plugin is older than the app. It says nothing
when there is no plugin, when an old MCP or the legacy plugin is still there,
or when a repo's setup is older than the app's.

## Decision

### Claude Code is brought up to date in one click

Each time the projects page opens, the app reads Claude Code's own records on
this computer and lists what is behind:

- **An MCP added by hand**: a server in the person's own config
  (`~/.claude.json`, for them or for one folder) that runs the app's
  `out/main/mcp.js` from a path naming codegraph.
- **The legacy plugin**: `codegraph@codegraph`, installed or turned on for the
  person.
- **The skills**: `codegraph-app` missing, or older than the app, wherever it
  is installed.

When anything is listed, a notice beside the update notice says so, with one
button, **Clean up**. The app then runs Claude Code's own `claude` command, in
this order, and stops at the first step that fails:

1. Install the plugin (adding the marketplace first if Claude Code does not
   know it), or update each install that is older than the app.
2. Turn the legacy plugin off for the person, and uninstall it if it was
   installed for them.
3. Remove each MCP added by hand.

The plugin comes first, so a person is never left with no codegraph at all.
The **Your agent** sheet shows the same list and the same button. Where the
app cannot find the `claude` command, it shows the commands to run instead.

The app never changes Claude Code's files itself. Claude Code rewrites
`~/.claude.json` while it runs, and its own command is the one way in that
keeps up with that.

### A repo says which setup it got

Setup writes the version it is into `codegraph.config.json`:
`"setup": "0.6.0"`. The app knows which setup is current, and a repo whose
config says an older one, or none, is **set up by an older codegraph**. Its row
says so, names what is left over (a `CONTEXT.md`, a `docs/adr/` folder, the
legacy plugin turned on in its settings), and asks the person to have their
agent run setup again. Setup on a repo set up before is the update: it does
only what the repo lacks.

The setup version moves only when what setup asks of a repo changes, not with
every release.

## Considered options

- **Clean up silently, each time the app opens.** No click, but the app would
  change another program's settings without a word, and a person who opened the
  app only to look would find their agent changed.
- **Edit Claude Code's files directly.** Needs no `claude` command, but
  `~/.claude.json` is rewritten by every running session, so an edit can be
  lost or lose theirs.
- **Leave the legacy plugin alone.** It is still a product (the root CLAUDE.md
  keeps it working). But turned on alongside the new plugin it gives an agent
  two codegraphs. Turning it off for the person keeps it working in a legacy
  repo, whose own committed settings turn it on there.
- **Tell a repo's setup is behind from what it holds.** No stamp to write, but
  each future setup change would need its own rule for spotting it, and a repo
  that never had a `CONTEXT.md` would look up to date.
- **One click, through Claude Code's command, and a setup version in the
  config.** Chosen.

## Consequences

Updating the app and pressing **Clean up** once leaves Claude Code with the
plugin at the app's version and nothing older beside it. Each set-up repo the
update leaves behind is marked on its row until setup runs on it again.

A repo's config gains one field, `setup`, written only by setup.

The `claude` command is looked for where Claude Code installs it, on the
`PATH` and in its usual folders, the Claude desktop app's own copy among them.

An MCP for codegraph committed in a repo's `.mcp.json` is the repo's, not the
person's: setup removes it, with the rest of the old codegraph it clears out.
