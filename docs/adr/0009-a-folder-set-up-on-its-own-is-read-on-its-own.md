# A folder set up on its own is read on its own

Codegraph is tried end to end on a small real app kept inside its own repo,
under `tests/indie-stack`. That app is set up for codegraph like any other
repo: every file tagged, its own rules in its own `CLAUDE.md`. Read as part of
codegraph's repo, its tags would claim modules, features and pages in
codegraph, and codegraph's own check would go red over code that is not
codegraph's.

So a folder whose `CLAUDE.md` or `AGENTS.md` holds the block setup writes
(`<!-- codegraph:start -->`) is a codegraph repo of its own. Reading the repo
around it leaves it out; pointing codegraph at the folder reads it whole.

## Considered options

- **Keep the app as a git submodule.** It was one: the submodule was never
  read with the repo around it. But it pinned an archived upstream that
  nothing here could change, so the app could not be set up, cleaned up or
  grown alongside codegraph, and every try had to be reset by hand.
- **A list of folders to skip, kept in a config file.** One more file to keep
  true by hand, and it says nothing about why the folder is skipped. The
  setup block is already the mark that a folder answers to codegraph on its
  own terms.
- **Tag the app's files as tests of codegraph.** They are not codegraph's
  tests, and their own tags are the point of the app.
