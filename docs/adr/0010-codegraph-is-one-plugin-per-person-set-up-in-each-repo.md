# Codegraph is one plugin per person, set up in each repo

Codegraph is set up *in* a repo, and its rules only hold while every agent
working there has the plugin: the check, the map and the skills. A person
works in many repos, and wants one codegraph, updated in one place, not a
copy per repo or a link to hand an agent each time.

So codegraph is turned on once in the person's own Claude settings
(`extraKnownMarketplaces` naming this repository, with `autoUpdate` on, and
`codegraph@codegraph` in `enabledPlugins`), and loads in every project they
open. The marketplace lists the plugin by a relative path, so Claude Code
loads it from the marketplace's own copy: the `claude` command line is not
needed. `codegraph.py --profile` writes it; an agent given this repository's
link follows `INSTALL.md`.

A repo is brought in with `/codegraph:setup`, which is also the update: run
again, it writes this codegraph's rules over the old block and tags only what
has no tag. Codegraph knows a repo is set up by the block in its `CLAUDE.md`
or `AGENTS.md` (docs/adr/0009). Where there is no block, it stays out of the
way: no row above the chat box, no program run, and the check says how to
set the repo up. Where the block is older than its own, the row says so.

Setup also commits the same two entries in the repo's `.claude/settings.json`.
For the person who has codegraph already it changes nothing: it names the same
plugin, so they still have one. For anyone else who opens the repo, it is how
codegraph reaches them without being told, once they trust the folder.
`codegraph.py --install` writes them, with the rules block and the ignore
line, and keeps what those files already said.

## Considered options

- **Only in each repo's settings.** It works for everyone who opens the repo,
  but a person brings each repo in by handing an agent a link, and nothing
  says they have codegraph until they open a repo that has it.
- **Only in the person's settings.** One copy, but the repo's rules then
  point at tools the next person may not have.
- **Ask each person to run `claude plugin install`.** It works, but only for
  whoever remembers, and a desktop app session has no `claude` on the path.
- **Copy the plugin into the repo's `.claude/skills/`.** It loads without a
  marketplace, but every repo then holds its own copy that never updates.
- **Let the agent edit the settings by hand.** Merging JSON by judgment is
  where an install quietly drops someone's permissions. A program that keeps
  every other key, and changes nothing on a second run, is safer.

## What it costs

A cloud session reads neither, so codegraph is not there. A plugin in the
person's settings loads in every project, so its tools' descriptions ride
along even where the repo is not set up. A marketplace already named
`codegraph`, such as a copy someone works on, is kept as it is, not switched
to this repository; working on codegraph itself is done with `--plugin-dir`,
which wins over either.
