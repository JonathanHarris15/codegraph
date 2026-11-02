# Codegraph for any agent, and more than one repo

A look at taking codegraph out of Claude and into a thing that stands on its
own, holding several repos at once. Written 2026-11-02, against the proposal
for "a lightweight desktop app with a CLI any agent can talk to". Companion to
`where-codegraph-is-going.md`. Nothing here is decided until it lands as an
ADR.

## The short version

There are two wishes in the proposal and they are separate problems.

**Any agent** is solved by an interface, not by a window. The core already
knows nothing about Claude: it parses, reads tags, checks rules, draws a page.
What is Claude-shaped is a thin shell around it. Replace the shell with a
protocol and every agent gets codegraph tomorrow.

**Many repos at once** is the real new capability, and it is the only part that
genuinely needs something that stays running. It is also a model problem before
it is an app problem.

A packaged desktop application is the last of the five steps below, not the
first, and it may never be needed.

## What is already agent-agnostic

- Parsing, tags, rules, layout, drawing: plain Python, no Claude anywhere.
  `python codegraph.py . --check` exits 1 on a mismatch. That already works
  from any terminal, under any agent, in CI.
- The live map is already a page served on 127.0.0.1 behind a secret path, with
  its own channel back: `ask`, `refresh`, `plan`. Nothing in the server knows
  what is listening.
- The rules an agent must follow already travel in the repo, as a block in its
  `CLAUDE.md` or `AGENTS.md`.

What is Claude-shaped, all of it thin:

- `hooks/register.tsx`, 628 lines: starts `--serve`, hears the `{"ask": ...}`
  line and fills the chat box, draws the row above the chat and the pane, and
  registers three tools.
- `skills/{setup,fix,plan,open}/SKILL.md`: procedures in prose that only Claude
  Code loads.
- `modules/installing`: writes Claude's settings, for the person and for the
  repo.

So this is not a rewrite. It is three jobs: give the tools a real protocol, make
the skills readable by anything, and find another way to do the one thing a file
cannot do — fill someone's chat box.

## Where I'd push back

### The window does not make it agent-agnostic. MCP does.

The three tools are registered through Claude Code's own plugin API. The
`mcp__codegraph__` prefix is a name, not a protocol — there is no MCP server in
this repo. Write one, `codegraph mcp` on stdio, carrying `check`, `map`, `plan`
and `open`, and Claude Code, Codex, Cursor, Windsurf, Zed, Copilot and anything
else that speaks MCP has codegraph with no plugin per host. That is one module,
and it is the whole of "any agent" for everything the agent reads. The Claude
plugin then keeps only what MCP cannot do: the row above the chat box, and the
chat-box fill.

### "A CLI connected into any AI agent" is a muddle worth clearing up

A CLI is a command someone runs, and then it exits. It cannot be a live wire
between a window and a running agent session. There are two directions here and
they are not alike.

**Agent to window** is easy and needs no wire at all. The agent writes files:
tags into source, a plan into `plans/`, a design into `designs/`. The window
watches the repo and redraws. Plans already work this way; what is missing is a
file watcher, so it redraws when the code changes rather than when a host says a
turn finished.

**Window to agent** is the hard one, and it is hard today too. `register.tsx`
solves it by filling the chat box, which only works because it lives inside the
host. A window of its own has no chat box to fill. Three options, in the order I
would ship them:

1. **Put the prompt on the clipboard.** Fix, Ask and Build it copy the sentence
   and show it. Works with every agent that will ever exist, and a person stays
   in the loop. Dull, and right for the first version.
2. **Run the agent headless.** Each one has a single-shot command — `claude -p`,
   `codex exec`, and so on. One command template per agent in a config file the
   person writes, spawned in the repo, its output streamed into a panel. This is
   the real "any agent you want", and it is small. The cost is an agent changing
   code while nobody watches: the person reviews a diff instead of a
   conversation.
3. **Push into a live session over MCP.** Elicitation and sampling exist on
   paper; support is thin and uneven. Skip it.

The rule to hold on to through all of this: **the repo is the only shared
state.** Tags in the code, plans in `plans/`, designs in `designs/`, pictures in
`.codegraph/`. Nothing passes between the window and the agent except files, and
"go and look". That keeps the spirit of ADR 0002 — the code is the architecture —
and it means an agent nobody has heard of yet still works.

### The window is for the person. The check is for the agent. Neither replaces the other.

Half of codegraph's worth today is that it is in the agent's face: the rules in
`CLAUDE.md`, the row above the chat box, the check after every change. Move the
map into its own window and that nagging stops, and tags rot. So keep the
repo-local half whatever else happens: the `AGENTS.md` block, and `codegraph
check` in a pre-commit hook and in CI. The window is where a person thinks; the
check is what holds the line.

### Don't package a desktop app yet

A server that stays running plus a browser tab gives nearly everything the
window is for — several repos at once, surviving between agent sessions, the
same on Mac and Windows — for a fraction of the work, with no installer, no
signing, no update channel and no second runtime. Codegraph's quiet advantage is
that it installs with Python and nothing else. Wrap it in Tauri when a browser
tab is the actual complaint; not for the reasons listed in this document. What
makes it feel like an app is that it stays running and holds several repos, not
that it has a title bar.

### One repo per map is a model problem first

This is the strongest part of the proposal and the part with the most thinking
left. `CONTEXT.md` already has **Program** — "one thing the repo ships that runs
on its own" — and already says code in one program cannot import code in
another, and that only a module reaches an outside connection. Most of the model
for a product spanning repos is written. Two things are missing.

**A word above the repo.** A browser app, an API and a worker in three repos are
one thing people use. I would call it a **Product**: one thing people use, made
of one or more programs, in one or more repos. _Avoid_: suite, platform,
solution, monorepo. The list of repos a person happens to have open is not a
domain word — that is a workspace, it is tooling, and it stays off the map.

**Stitching, which is new logic and the best part of the idea.** Codegraph
already turns a URL in the source into an outside card, and already spots
`FastAPI()` as a server. With three repos in one window, an outside card in one
repo whose host matches a program another repo serves stops being an outside
card and becomes a wire between two programs. Three maps become one picture, and
no repo-local plugin can ever draw it. The hard question lives here too: how
does a person say "this card and that program are the same host" when the URL is
in an environment variable and not in the source? The honest answer is probably
that the workspace file says so, and the map shows what it was told apart from
what it read.

One more thing to notice now and not solve now: once a product spans repos, the
domain language wants to be shared too. Three `CONTEXT.md` files that disagree
about what a Member is are the same bug tags were invented to catch.

## The path

Each step is usable on its own, and none of the first four needs a window.

**1. A real MCP server.** `codegraph mcp` over stdio: `check`, `map`, `plan`,
`open`. The command line grows verbs an agent can use rather than flags —
`codegraph check`, `codegraph map --json`, `codegraph fix --next` printing one
mismatch and the rule it broke. Every MCP host gets codegraph. The Claude plugin
shrinks to the chat-box fill and the row.

**2. The rules travel in the repo, not in skills.** The four skills become
procedures in the repo: the `AGENTS.md` block, or files it points at, so any
agent reads them. Install writes `AGENTS.md` first, `CLAUDE.md` where that is
the convention, and whatever else the hosts read beside them. Setup becomes
`codegraph setup`, leaving the agent only the part that needs judgment:
correcting each guessed tag.

**3. Many repos in one server.** `codegraph serve` takes a workspace file
instead of one folder: several repos, one page, a watcher per repo so it redraws
on a change rather than on a host's say-so. Still a browser tab.

**4. Stitching.** Match one repo's outside connections to another repo's served
programs and draw the product as one picture. New words in `CONTEXT.md`, and an
ADR.

**5. A window, if it is still wanted.** A shell around the same page, earning
its keep with the one thing a tab cannot do: spawn an agent in a repo and show
what it says.

Alongside: the reverse channel. Clipboard at step 1; headless agent adapters
once there is a workspace and somewhere to show the output.

## What I need from you

1. **Is "any agent" really "any MCP host"?** If yes, step 1 is most of the work
   and the window is optional. If you mean agents with no MCP at all, then the
   command line and the `AGENTS.md` block are the whole interface, and that is a
   different first step.
2. **Product, or another word?** It goes in `CONTEXT.md` above Program, and
   everything in step 4 is named after it.
3. **Headless agents, or a person pressing send?** This decides whether the
   window is a drawing board that hands you prompts, or something that changes
   your code while you watch a panel.
