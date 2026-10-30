# Installing codegraph

These steps are for an agent asked to install codegraph, given this
repository's link. There are two parts:

- **Once per machine:** turn the codegraph plugin on in the person's own
  Claude settings. It then loads in every project they open, and keeps
  itself up to date. In a repo that is not set up for codegraph it stays out
  of the way: no row above the chat box, nothing run.
- **Once per repo:** set the repo up. That writes the rules into its
  `CLAUDE.md`, tags every file, and turns the plugin on in the repo's
  committed `.claude/settings.json` too, so anyone else who opens the repo
  gets codegraph without being told. Running it again on a repo that is set
  up is the update.

Do the first part when asked to install codegraph at all; do both when asked
to install it in a particular repo.

## Turn codegraph on for this person

1. Find Python 3.10 or newer: `python`, `python3`, or `py -3` on Windows. If
   there is none, stop and say so: codegraph needs it.

2. Fetch codegraph into a folder outside any repo, such as a temp folder:

   ```
   git clone --depth 1 https://github.com/JonathanHarris15/codegraph.git <temp>/codegraph
   ```

   Call `<temp>/codegraph/codegraph.py` `CG` below.

3. Run `python CG --profile`. It adds two entries to the person's Claude
   settings (`~/.claude/settings.json`, or the folder `CLAUDE_CONFIG_DIR`
   names) and keeps every other setting: this repository as a plugin
   marketplace, and `codegraph@codegraph` turned on. Where the person
   already has a marketplace named `codegraph`, such as a copy they work on,
   it keeps theirs.

4. Tell the person codegraph loads in their next Claude Code session, in
   every project, and that `/codegraph:setup` sets a repo up.

## Set a repo up

In a session where codegraph has loaded, this is `/codegraph:setup`, which
the person runs. In the session that just installed it, codegraph has not
loaded yet, so do it by hand:

1. The repo must be a git repository with a clean working tree; if it is
   not clean, stop and ask.

2. Follow `<temp>/codegraph/skills/setup/SKILL.md`, with the same `CG`. It
   branches, turns codegraph on in the repo with `python CG . --install`,
   tags every file (a first guess, then each corrected by reading the code),
   commits, and reports what the check found. It moves no code. If the repo
   has TypeScript or JavaScript, it needs `pip install tree-sitter
   tree-sitter-typescript tree-sitter-javascript`; ask before installing.

3. Delete the temp clone, and tell the person:
   - Start a new Claude Code session in the repo, and trust the folder if
     asked. A codegraph row shows above the chat box; `/codegraph:open`
     opens the map, `/codegraph:fix` fixes the next mismatch.
   - Merging the branch turns codegraph on for everyone who works there.

## Running it again

Every step is safe to run twice. `--profile` and `--install` change nothing
that is already right; on a repo that is set up, `/codegraph:setup` updates
the rules to this copy's and tags only files with no tag.
