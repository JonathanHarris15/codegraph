# A design system the code runs

A repo with a browser app keeps a design system: how it looks, held to its
code. It is three things, and codegraph draws each one for the person.

- **DESIGN.md** holds the **tokens**: every colour, space, corner radius and
  type style, by name.
- **UI blocks** are the named pieces of screen pages are built from, like
  `SettingsRow` or `DatePicker`. They are the names a person points you at.
- **Recipes** say how each kind of page lays itself out.

Setting it up records how the app looks **now**. It never changes how
anything looks: every swap below puts in a token of the same value. Changing
the look is the person's call, made later, in the app or by a sketch.

Do it in the setup sweep, as a slice of its own, or on its own branch
(`codegraph-design`) in a repo already set up. Read the `tags` topic first.

## 1. Find the values the code really uses

Read every stylesheet, style object, theme file and class list. List each
distinct colour, each padding, margin and gap, each corner radius, and each
font setting, with how often it is used and where.

Keep every distinct value. Where two are nearly the same (`#6b7280` and
`#6b7281`, `15px` and `16px`), do not merge them: merging changes how the
app looks. List them for the person instead, in the hand-over.

## 2. Write DESIGN.md

At the repo root, in Google's DESIGN.md format: tokens in yaml between
`---` fences at the top, and the reasons for them below, under `##`
headings.

```markdown
---
name: Daylight
description: Calm neutrals and one accent.
colors:
  blue-500: "#2563eb"
  white: "#ffffff"
  action: "{colors.blue-500}"
  surface: "{colors.white}"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
spacing:
  sm: 8px
  md: 16px
rounded:
  md: 8px
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: 12px
---

## Overview
...
```

- **Raw tokens** are the values: `blue-500: "#2563eb"`. Name colours by what
  they are, sizes by a scale.
- **Purpose tokens** name a raw one for what it is for: `action:
  "{colors.blue-500}"`. Make one wherever the code uses a value for a clear
  role: an action, a surface, text on a surface, an error, a border.
- **Block tokens**, under `components`, say what one UI block uses.
- Quote every colour, and every value that starts with `{`. Give every radius
  a unit (`px`, `em`, `rem`).
- Write the sections (Overview, Colors, Typography, Layout, Shapes,
  Components, Do's and Don'ts) from what the code shows. Keep them short.
  Where you are guessing at a reason, say so, as a question for the person.

## 3. Make the theme from it

One file is the theme, tagged `theme` beside its module's tag. It holds one
CSS variable per colour, space and corner token, named by its path with a
dash for the dot. A purpose token names its raw one the CSS way.

```css
/* codegraph: module design-system */
/* codegraph: theme */
:root {
  --colors-blue-500: #2563eb;
  --colors-white: #ffffff;
  --colors-action: var(--colors-blue-500);
  --colors-surface: var(--colors-white);
  --spacing-md: 16px;
  --rounded-md: 8px;
}
```

The check holds this file to DESIGN.md, token for token, so put the light
values in the first rule; a dark theme's values go in a later one. Where the
app uses Tailwind or another theme config, point it at these variables
(`action: 'var(--colors-action)'`) so its classes run through them too.

## 4. Use the tokens

In every component's files, swap each raw colour, and each raw size given to
a padding, margin, gap or radius, for the token with that value:
`var(--colors-action)`, `var(--spacing-md)`. Use the purpose token, not the
raw one under it. The check names each raw value it finds, and the token
with that value where there is one.

Where a value has to stay raw, say why on its line, or on the line above:
`// codegraph: exception the brand logo's own orange`. The check lists
these apart, with why, and still passes.

## 5. Name the UI blocks

Each piece of screen more than one page shows, or that a person would point
at by name, is a UI block. Tag its file beside its component's tag, with a
folder for where it is kept:

```tsx
// codegraph: module design-system
// codegraph: ui block settings/SettingsRow
/** One setting: its label on the left, its control on the right. */
export const SettingsRow = ({ label, hint, tone = 'plain', control }: {
  /** What the setting is called. */
  label: string
  /** A line under the label, never under the control. */
  hint?: string
  /**
   * How loud the row is.
   * plain: most settings
   * danger: only inside the danger zone
   */
  tone?: 'plain' | 'danger'
  control: ReactNode
}) => ...
```

- The name is the name the code exports. Folders group them by area:
  `layout`, `navigation`, `forms`, `feedback`, `data`, or the app's own.
- Write the props as a type in place, or as an interface or type in the same
  file: that is where codegraph reads the options.
- A doc comment on the block says what it is for. One on each prop says what
  it is for, and a line like `danger: only inside the danger zone` says what
  one choice means.

## 6. Give each UI block its states

Beside each UI block, a file tagged `states <Name>`, one export per named
situation it can be in, each rendering the block in it with made-up data
and no network:

```tsx
// codegraph: states SettingsRow
export const loading = () => <SettingsRow.Skeleton />
export const noPermission = () => <SettingsRow label="Plan" control={<Switch disabled />} />
```

Loading, empty, error, disabled and no permission are the usual ones. Only
write states the block really has.

## 7. The page the live view opens

Codegraph shows a UI block running from the repo's own dev server. Add one
page to the app, served in development only, at `/__codegraph/ui-block`:

- `?name=settings/SettingsRow` renders that UI block,
- `&state=loading` renders that export of its states file instead,
- `&options={"tone":"danger"}` (JSON) renders it with those options, over
  plain made-up ones for any it must have.

Wrap it in whatever the app wraps every page in (its theme, router, data
providers), so the block looks as it does in the app, and draw nothing else
around it. A sketch for React:

```tsx
// codegraph: tooling
import { SettingsRow } from '../design-system/settings-row'
import * as settingsRowStates from '../design-system/settings-row.states'

const blocks = {
  'settings/SettingsRow': { block: SettingsRow, states: settingsRowStates, needs: { label: 'A setting', control: null } },
}

export const CodegraphUiBlock = () => {
  const ask = new URLSearchParams(location.search)
  const found = blocks[ask.get('name') ?? '']
  if (!found) return <p>No UI block called {ask.get('name')}</p>
  const State = found.states[ask.get('state') ?? '']
  if (State) return <State />
  const Block = found.block
  return <Block {...found.needs} {...JSON.parse(ask.get('options') ?? '{}')} />
}
```

Route to it only when the app runs in development (`import.meta.env.DEV`
under Vite), so it never ships. Then name where the dev server answers on its
container in `codegraph.config.json`, on this computer: `"dev":
"http://localhost:5173"`.

## 8. Pictures

If the repo's UI tests can open pages, have one open each state at the
address above and save a picture to
`codegraph-screenshots/ui-blocks/<Name>.<state>.png`, and one of the block
as it is to `<Name>.png`. `codegraph-screenshots/` stays out of git.

## 9. Write the recipes

For each kind of page that three or more pages share, write one file in
`recipes/`, named for the kind:

````markdown
---
recipe: settings-page
use-when: A page where the user changes options for one thing.
not-for: Forms that create something new (use `create-form`).
reference: src/pages/account-settings.tsx
---

# Settings page

## Skeleton
```
<PageHeader title />
<SettingsRow label hint? control />   // repeat
<DangerZone />                        // always last
```

## Rules
## States
## Don't
````

- `reference` is the file of the page that does it best.
- The skeleton names the UI blocks the page is built from, as tags.
- Write rules only from what the pages already do. Where they differ, do not
  pick one: list it for the person.
- Tag each page that follows it, at the end of its tag:
  `// codegraph: page account at /account follows settings-page`.

The check holds each page to its recipe's UI blocks, and the recipe to its
reference page. The rules stay words, for you and the person.

## 10. Check, and hand it over

- Run the repo's tests and type checks: nothing may look or work differently.
- Call `check` and fix what it lists, until it lists nothing but exceptions.
- Tell the person, plainly: the tokens you found, the near-duplicates for
  them to decide, each exception and why, the UI blocks and recipes, and
  how to see it: start the dev server, open the software system in
  codegraph, and press Design system.

## Keeping it, after setup

- Style with tokens, through their variables; never a raw value without an
  exception that says why.
- Build pages from UI blocks. A new piece of screen that more than one page
  needs is a new UI block, with its doc comments and states, added to the
  live view's page.
- A page of a kind that has a recipe follows it, and says so in its tag.
- Before you change a UI block, call `working-on` with
  `ui block <folder>/<Name>`: the person sees it change live as you work.
- A new value goes in DESIGN.md first, then the theme, then the code.
