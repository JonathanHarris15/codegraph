# Installing codegraph in a repo

These steps are for an agent asked to install codegraph in a repo, given
this repository's link. When they are done, the repo has the codegraph
plugin turned on for everyone who opens it in Claude Code, its rules in the
repo's `CLAUDE.md`, and every source file tagged. Nobody has to install
anything else by hand.

How it works: the install commits a `.claude/settings.json` that names this
repository as a plugin marketplace and turns `codegraph@codegraph` on. The
next time Claude Code opens the repo, once the person trusts the folder, it
fetches the marketplace and loads the plugin from it, and keeps it up to
date. The `claude` command line is not needed.

## Steps

1. **Check the repo.** It must be a git repository with a clean working
   tree; if it is not clean, stop and ask. Find Python 3.10 or newer:
   `python`, `python3`, or `py -3` on Windows. If there is none, stop and
   say so.

2. **Fetch codegraph** into a folder outside the repo, such as a temp
   folder:

   ```
   git clone --depth 1 https://github.com/JonathanHarris15/codegraph.git <temp>/codegraph
   ```

   Call `<temp>/codegraph/codegraph.py` `CG` below.

3. **Branch.** Create a branch `codegraph-setup` (prefix it if the repo's
   branches use one).

4. **Turn codegraph on.** From the repo's root, run:

   ```
   python CG . --install
   ```

   It writes three things and keeps whatever those files already say:
   `.claude/settings.json` (the marketplace and the plugin), the codegraph
   block in `CLAUDE.md` (or `AGENTS.md`, if the repo keeps its agent rules
   there), and `.codegraph/` in `.gitignore`. If it says it could not read
   `.claude/settings.json`, fix the file by hand with the person, then run
   it again.

5. **Tag the repo.** Follow `<temp>/codegraph/skills/setup/SKILL.md` from
   its step 2, **Draft**, with the same `CG`. This is the real work: a first
   guess at every file's tag, then each one corrected by reading the code.
   It moves no code. If the repo has TypeScript or JavaScript, it needs
   `pip install tree-sitter tree-sitter-typescript tree-sitter-javascript`;
   ask before installing.

6. **Commit** on the branch: `Set up codegraph: tag every file`. Delete the
   temp clone.

7. **Tell the person** what the check found, as setup's report step says,
   and what happens next:
   - Start a new Claude Code session in the repo, and trust the folder if
     asked. A codegraph row shows above the chat box; `/codegraph:open`
     opens the map, `/codegraph:fix` fixes the next mismatch.
   - Merging the branch turns codegraph on for everyone who works here.

## Installing again

Running the steps on a repo that has codegraph already is safe:
`--install` changes nothing that is already right, and the draft only tags
files that have no tag.
