# 24. A design system the code runs

Date: 2026-11-09

## Status

Accepted.

## Context

Codegraph shows what a software system is made of and how its parts are wired,
but not how it looks. The colours, spacing and corner radii a web app is built
from, the named pieces of screen it is assembled out of, and the rules for how
each kind of page lays itself out are nowhere on the map. An agent asked to
"make the settings page match the others" has to guess what "the others" do.

People already write this down. Google's open DESIGN.md format (alpha, Apache
2.0) puts a project's values at the top of a Markdown file and the reasons for
them below. Teams write page recipes like this one:

```md
---
recipe: settings-page
use-when: A page where the user changes options for one thing.
not-for: Forms that create something new (use `create-form`).
reference: src/app/(app)/account/settings/page.tsx
---

# Settings page

## Skeleton
## Rules
## States
## Don't
```

And packs of agent skills, like design-system-ops, audit a design system from
the outside: values that skip the system, pieces rebuilt by hand, pages that
drifted.

What they share is the weakness ADR 0023 names for stores: written beside the
code and run by nothing, every one of them drifts the first time someone is in
a hurry. Codegraph's job is to hold software to what was decided. A design
system is a decision about how software looks, so it should be held the same
way, and drawn so a person can see it rather than read it.

## Decision

A software system's **design system** is three things, each written where the
code runs it or checks against it, and each drawn by codegraph:

1. **DESIGN.md**: the tokens.
2. **UI blocks**: the named pieces of screen.
3. **Recipes**: how each kind of page lays itself out.

It belongs to one software system, since it is that repo's code that has to
run it.

### DESIGN.md and its tokens

DESIGN.md sits at the root of the repo, in Google's format: **tokens** at the
top, between `---` fences, and the reasons for them below in `##` sections.
We take the open format, not one of our own, so a DESIGN.md written for
another tool works here and one written here works there.

A token is one named value: a colour, a space, a corner radius, a type style.
Google's format keeps them in groups (`colors`, `typography`, `rounded`,
`spacing`, `components`), and a token may name another by its path, as
`{colors.blue-500}`. Tokens come in three tiers, which the reader tells from
how each is written:

- **Raw**: the value itself. `colors.blue-500: "#2563eb"`.
- **Purpose**: what it is for, naming another token. `colors.action: "{colors.blue-500}"`.
- **Block**: what one UI block uses, in the `components` group (Google's word,
  kept so the file stays theirs). `components.button-primary.backgroundColor: "{colors.action}"`.

The code runs DESIGN.md because the theme it styles with is made from it,
not written beside it. Setup arranges that. The theme is one file, tagged
`theme` beside its module's tag, holding one CSS variable per token, named
by the token's path with a dash for the dot: `colors.action` is
`--colors-action`, and a purpose token names its raw one the CSS way,
`--colors-action: var(--colors-blue-500)`.

```css
/* codegraph: module design-system */
/* codegraph: theme */
:root {
  --colors-blue-500: #2563eb;
  --colors-action: var(--colors-blue-500);
}
```

The check then holds the code to it:

- the theme matches DESIGN.md, token for token, and has none it does not;
- no component's file uses a raw value where a token belongs: a colour
  (hex, `rgb()`, `hsl()`), or a size or corner (`px`, `rem`, `em`) given to
  a padding, margin, gap or radius. Where DESIGN.md has a token of that
  value, the check names it;
- no component's file reaches past a purpose token for a raw one that a
  purpose token names.

Breaking one of these on purpose is allowed if the line says why, at its end
or on a line of its own above it, as a wire's words are:
`// codegraph: exception the brand logo's own blue`. An **exception** is not
drift: the check lists it apart, with why, and still passes. One with no why
is a mismatch.

For now the check holds only tokens of one value each: colours, spacing and
corners. Type styles and UI block tokens are made of parts, and the theme
has no settled way to spell them yet; they come when one is chosen. Only the
first value the theme gives a variable is compared, so a dark theme that
gives it another is not read.

**On screen**, DESIGN.md is never shown as text. Each token is drawn as what it
is: a colour as a swatch, a space as a box that size, a radius as a corner at
that radius, a type style as a line set in it. Picking a token shows what it
names and everything that names it, down to the UI blocks that use it. Where
DESIGN.md pairs a text colour with a background, the view shows their contrast
and says whether it reads.

**Changing a token.** Codegraph lets a person drag a space, pick a
colour or round a corner, and writes the change into DESIGN.md in their
working copy. It never writes on the main line: like "Propose a change", it
makes a branch first. The agent then brings the code along, and the check says
when it has. It is not a proposal, as data changes are since ADR 0023: that was
chosen there because a wrong migration loses records, but a wrong colour loses
nothing and is put back with undo, so a branch is enough here.

### UI blocks

A **UI block** is a named piece of screen that pages are built from: a
`SettingsRow`, a `DangerZone`, a `Button`. It is what a person points at when
they tell an agent what to change, so its name is the name the code exports.

A UI block is not a component in the map's sense: it lives inside one,
usually the design system module, at the code level. Its file carries the
module's tag as usual, plus a second line naming the block and its folder:

```ts
// codegraph: module design-system
// codegraph: ui block settings/SettingsRow
```

The folder (`settings`) is how UI blocks are grouped in codegraph. Folders can
hold folders: `forms/inputs/DatePicker`.

The reader reads each UI block's **options** from its code: the props of a
React component, with each one's type and values. What each option means
(`primary: the single most important action on the page`) is written in the
code's own doc comment on that prop. The options come from the code and the
meaning comes from the person, the same split a wire has between its kind and
its words.

A UI block's **states** are the named situations it can be in: loading, empty,
save failed, no permission. They sit in a file beside it that renders each one:

```ts
// codegraph: states SettingsRow
export const loading = () => <SettingsRow.Skeleton />
export const noPermission = () => <SettingsRow label="Plan" disabled owner="Ada" />
```

The same file feeds the live view and the screenshots the tests already take.
A states file belongs to no component, as a test does not. Its pictures sit
beside the pages' in `codegraph-screenshots/ui-blocks/`: `SettingsRow.png`
for the block, `SettingsRow.loading.png` for a state.

A UI block's options are read from the props of the function, arrow
function, or `memo` or `forwardRef` around one, that the file declares by
its name: written in place, or as an interface or type of the file's own.
An option's doc comment says what it is for; a line in it like `danger: only
inside the danger zone`, naming one of its choices, says what that choice
means. Props of a type from another file are not followed yet.

**On the map**, opening the design system module shows its UI blocks as cards,
in their folders, each with its screenshot. Until that is drawn, they are
shown in the design view, beside the tokens.

### Recipes

A **recipe** is one Markdown file in `recipes/` beside DESIGN.md, in the shape
above: what the page kind is for and not for, a reference page, the skeleton of
UI blocks it is built from, and its rules, states and don'ts. Most of a recipe
is written for agents and people, and the check leaves it alone. Two parts are
tied to the code:

- A page names the recipe it follows, in its own tag, as a repo names its
  projects (ADR 0006):
  `// codegraph: page account-settings at /account/settings follows settings-page`
- The check holds each such page to its recipe: the recipe exists, the page
  uses every UI block the skeleton names, and the reference page follows it.

**On the page map**, each page is marked with its recipe, so "which pages use
the back arrow" is answered by looking. A recipe opens to its words beside its
reference page's screenshot.

### The live view

The **live view** is a pane beside the canvas showing a UI block, or a recipe's
reference page, running from the repo's own code as it stands now. It is how a
person tries a UI block rather than looks at a picture of it.

It runs on the repo's own dev server. Setup gives each UI block's states an
address there, and codegraph opens that address in the pane. Each option gets
a control, and changing it redraws the block. The dev server reloads as files
change, so while an agent works on a UI block the pane changes with it. The
agent already reports which card it is on (`working-on`); naming a UI block
there moves the pane to it.

**Web apps first.** Only a browser app can be shown this way without
writing a runner for each kind of app. It starts with React on Vite, which this
app uses. Native apps get screenshots of their states and no
live view until there is a reason to build one.

### What setup does

A `design-system` topic in the instructions tells the agent how to set a repo's
design system up in the same sweep as the rest: write DESIGN.md from the values
the code really uses, make the theme from it, replace raw values with tokens,
tag the UI blocks, write their states, give them their live addresses, and
write a recipe for each kind of page that three or more pages share. Like
stores, it records what the code does now. Changing how the app looks is a
sketch and a proposal, or a token changed in the view, never part of setup.

## Considered options

- **Show DESIGN.md as text.** Cheapest, and no help: a person deciding on a
  radius needs to see the radius.
- **A token format of our own, or tokens in `codegraph.config.json`.** Ours
  would fit codegraph exactly and nothing else. The config is ruled out by
  ADR 0008 as a second description of the software.
- **DESIGN.md beside the code, unchecked.** What most teams have. It drifts.
- **Storybook for UI blocks and their states.** Many teams have it, and it does
  most of what the live view does. But it is a second program to install and
  keep running, many repos don't have it, and its stories don't say which page
  follows which recipe. A repo that already has Storybook could have its
  stories read as states later; Storybook is not required.
- **Screenshots only, no live view.** Simple, and enough for native apps. For
  web apps it loses the two things asked for: trying a UI block, and watching it
  change while the agent works.
- **Recipes that list their pages.** Easier to read in one place, but the list
  goes stale as pages are added. A page naming its recipe is checked where the
  page is.
- **Every design system change as a proposal.** The safe default, and what data
  changes do. Heavier than a colour needs.

## Consequences

A person can see a software system's design system, try its UI blocks, and
name one to an agent knowing the agent sees the same thing. The check catches
drift as it happens, instead of an audit finding it a quarter later.

Setup on an older repo finds a lot of raw values. Replacing them is the bulk of
the sweep, and a page can look slightly different afterwards where two
near-identical greys become one. Its branch has to be looked at before it is
merged.

The live view depends on the repo's dev server starting. A repo whose dev
server needs secrets or a database to start shows screenshots until it can.

Each kind of UI code needs its own reader for options, as each kind of schema
does for stores. Until a kind is read, its UI blocks show with no options.

Not decided here, and worth deciding when a project needs them: one design
system shared by several software systems; reading tokens from Figma; codegraph
suggesting a new UI block or recipe when several pages build the same thing by
hand; measuring contrast on the running page as well as in DESIGN.md.
