# codegraph desktop — the words

The app a person opens. It shows what they are working on and whether each
piece of it is in order. These are its words; the plugin's own words
(systems, modules, tags, mismatches) are in `../legacy/CONTEXT.md`.

## The things on the screen

**Project**:
A piece of work with one or more codebases under it. A person's unit of
attention: "Mosaic Manager", not "the api repo".
_Rule_: a project has a name and holds zero or more codebases; a codebase
belongs to one project.
_Avoid_: workspace, group, folder, solution

**Codebase**:
One repo. Either a working copy on this computer, or one known only from
GitHub and not downloaded yet.
_Rule_: a codebase in a project is tracked by git. A folder git does not
track is refused, not linked and flagged.
_Avoid_: repo (say repo for the thing on GitHub), project, package

**Set up**:
Codegraph is turned on inside a codebase: the plugin is named in the repo's
own committed Claude settings, the codegraph rules are in its `CLAUDE.md`,
and its files carry tags.
_Rule_: all three, or it is **needs setup**. The app only reports this; it is
`/codegraph:setup` inside the repo that does it.
_Avoid_: installed, configured, initialised

**Linking**:
Putting a repo already on this computer into a project. The person points at
a folder; the app reads it and remembers where it is.
_Rule_: linking never writes to the repo and never moves code.
_Avoid_: importing, adding, cloning

**Level with the cloud**:
The working copy and its GitHub copy are at the same commit. Otherwise it is
**behind** (commits on GitHub it does not have), has commits **to push**, or
has both and is **diverged**.
_Rule_: counts come from git, against what was last fetched. **Refresh**
fetches first; without it the app says what it last knew.
_Avoid_: out of date, stale, syncing, drift

**Signed in**:
The app holds a GitHub token for the person, kept in this computer's
keystore. With it, the app can say which repos they are part of are set up
for codegraph — including ones not on this computer.
_Rule_: the token never leaves this computer, and one GitHub will not take is
thrown away rather than kept.
_Avoid_: authenticated, connected, authorized

## Still open

A project lives on this computer only: nothing on GitHub records which
project a repo belongs to, so a cloud codebase shows as "not on this
computer" without saying which project it is in. The next decision is
whether a repo should carry its project's name in something committed.
