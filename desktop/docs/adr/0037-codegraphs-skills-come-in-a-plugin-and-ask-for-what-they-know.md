# 37. Codegraph's skills come in a plugin, and ask for what they know

Date: 2026-11-24

## Status

Accepted. Builds on ADRs 0004 and 0022. Replaces the `claude mcp add` command
the app hands out today.

## Context

An agent reaches codegraph through its MCP (ADR 0004). Everything codegraph
tells it lives in the instructions module, by topic: how to set a repo up, the
tag rules, proposals, sketches, the design system, and the block a set-up repo
carries in its CLAUDE.md or AGENTS.md. A person can write their own words for
any topic, and every edit is kept (ADR 0022).

That was enough while codegraph only drew a map. It now also keeps a project's
terms and decisions (ADRs 0035, 0036) and its design system (ADR 0024), and an
agent working in a set-up repo needs to know when and how to use them: adding a
term the right way, recording a decision on the ADR template, borrowing a term
from another repo, checking a plan against the ontology map. An instruction
topic is only read when an agent thinks to ask for it. A skill is what an agent
reaches for by itself, when the work in front of it calls for one.

Nothing ships those skills today. The legacy plugin has four, for the old
codegraph. The people using codegraph have their own skills for domain
modelling and decisions, which write `CONTEXT.md` and `docs/adr/`, the layout a
set-up repo no longer uses.

Skills copied into each repo, or into a person's own config, go stale the day
codegraph changes, and nothing would know.

## Decision

### A plugin, from the app

Codegraph ships its skills as a **Claude Code plugin**, `codegraph-app`, built
from `desktop/plugin/` and listed in the marketplace at the root of this repo
beside the legacy `codegraph`, which keeps its name. The plugin's version is
the app's version: they are released together.

The plugin also starts codegraph's MCP, so installing it is the one step that
connects an agent. The MCP still runs from the app a person has installed,
never from the plugin: each time the app opens it writes where its MCP is into
`.codegraph` (ADR 0026), and the plugin's small launcher starts whatever that
says. So the MCP an agent talks to is always the app's own, whatever plugin is
installed.

### Thin skills

A skill holds what makes an agent pick it up at the right moment, and the
steps of its job: what to ask, what to write where, what to check after. The
know-how behind those steps is not copied into it. The skill asks the MCP for
it, by instruction topic, so the agent is always told what the app it is
talking to says now, with the person's own words where they have written them
(ADR 0022). A skill changes when its steps change, which is rare. What it
knows can change any day.

The first skills:

| Skill | For |
|---|---|
| `setup` | Setting a repo up, or bringing an older setup up to what setup asks now |
| `terms` | Adding, changing, wiring and borrowing terms |
| `decide` | Recording a decision on the ADR template, with its rules |
| `grill` | Holding a plan up against the project's ontology map before building it |
| `check` | Running the check and fixing what it finds |
| `design` | Working in a design system: tokens, UI blocks, recipes |
| `propose` | Making a sketch a proposal on a branch, and building it |

### Where it is installed

Setup asks once, for each repo:

- **For you**: the plugin is installed for the person, in every repo on their
  computer.
- **For everyone on this repo**: the repo's `.claude/settings.json` names the
  marketplace and turns the plugin on, committed with the code. Turning it on
  installs nothing: each member runs
  `claude plugin install codegraph-app@codegraph --scope project` once in the
  repo, and the app says on the repo's row when they have not.

Either way, setup still writes the block into the repo's CLAUDE.md or
AGENTS.md, so an agent without the plugin still knows codegraph is there and
asks its MCP.

### Knowing when it is out of date

The plugin's launcher tells the MCP the plugin's version when it starts it.
When the plugin is older than the app, every answer to a topic starts by saying
so, and how to update it: `claude plugin update codegraph-app@codegraph`. The
app reads which repos turn the plugin on, from their committed
`.claude/settings.json`, and which version Claude Code has installed on this
computer, and says on a repo's row when the skills are not installed there or
are older than the app.

### Skills that step aside

In a repo with a `codegraph.config.json`, codegraph's skills are the ones that
write terms and decisions. A person's own skills that also do so are told, by
the block in the repo's CLAUDE.md, to leave that to codegraph there.

## Considered options

- **Copy the skills into each repo, or into the person's own config.** Works
  with any agent that reads skills, but every copy is a snapshot that goes
  stale, and checking for that means keeping a record of what was copied when.
  That is the drift codegraph exists to catch.
- **No skills: the instruction topics alone.** Always current, but an agent
  only reads a topic it thinks to ask for, and nothing makes it think to when
  it is halfway through adding a field to a store.
- **Skills that carry everything they know.** An agent needs nothing else, but
  a person's own words for a topic (ADR 0022) would never reach it, and every
  change to the know-how would be a new plugin release.
- **A plugin of thin skills, starting the app's own MCP.** Chosen. One install
  connects an agent and gives it the skills; the plugin's version says how old
  it is; and what the skills know is the app's, as it is now.

## Consequences

Connecting an agent becomes installing the plugin. The `claude mcp add` command
the app hands out today goes, and so does a person's having to know about it.

Every instruction topic the skills ask for has to say enough for an agent to
act on alone. A topic that only made sense read top to bottom becomes several.

The plugin is for Claude Code. Another agent still reaches codegraph through
its MCP and the CLAUDE.md or AGENTS.md block, as it does now, without the
skills; a plugin for it can follow when it has a way to install one.

A person's own skills for domain modelling and decisions need a line each to
step aside in a set-up repo. That is in their config, not here.

The card on a repo's row that says its setup has fallen behind (proposed
separately) can name the plugin among what is out of date.

The legacy plugin stays as it is, for the legacy codegraph.
