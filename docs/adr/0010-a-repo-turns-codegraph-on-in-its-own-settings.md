# A repo turns codegraph on in its own settings

Codegraph is set up *in* a repo, and its rules only hold while every agent
working there has the plugin: the check, the map and the skills. An install
that lives on one person's machine leaves the next person, and the next
machine, without them, and the rules in `CLAUDE.md` then point at tools that
are not there.

So installing codegraph in a repo commits a `.claude/settings.json` that
names this repository as a plugin marketplace (`extraKnownMarketplaces`,
with `autoUpdate` on) and turns `codegraph@codegraph` on (`enabledPlugins`).
The marketplace lists the plugin by a relative path, so Claude Code loads it
from the marketplace's own copy once the person trusts the folder: nobody
runs an install of their own, and the `claude` command line is not needed.
`codegraph.py --install` writes it, with the rules block and the ignore
line, and keeps what those files already said. An agent given this
repository's link follows `INSTALL.md`.

## Considered options

- **Ask each person to run `claude plugin install`.** It works, but only for
  whoever remembers, and a desktop app session has no `claude` on the path.
- **Copy the plugin into the repo's `.claude/skills/`.** It loads without a
  marketplace, but every repo then holds its own copy of codegraph that never
  updates, and the copies drift.
- **Let the agent edit the settings by hand.** Merging JSON by judgment is
  where an install quietly drops someone's permissions. A program that keeps
  every other key, and changes nothing on a second run, is safer.

## What it costs

A cloud session does not read a repo's marketplaces, so codegraph is not
there. A person who added codegraph from a local folder under the same
marketplace name has it switched to the GitHub copy when they open such a
repo; working on codegraph itself is done with `--plugin-dir`, which wins
over either.
