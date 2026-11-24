---
name: design
description: Design system — style, add or change a page or a UI block in a codegraph repo that has a DESIGN.md, or set a design system up. Use when the work touches how something looks: colours, spacing, type, a UI block or its states, a page's layout or the recipe it follows, or the theme.
---

# Working in the design system

1. **Get the rules.** Call the codegraph `instructions` tool with topic `design-system`: tokens, the theme, UI blocks and their states, recipes, and the live view.
2. **Look before you style.** Read `DESIGN.md`, the UI blocks the page could be built from, and the recipe the page follows.
3. **Say where you are.** Before changing a UI block, call the codegraph `working-on` tool with `ui block <folder>/<Name>` so the person watches it change live.
4. **Style with tokens.** Every colour, space, radius and type style comes from a token; a page is built from UI blocks and laid out by its recipe. A line that breaks the design system on purpose says why.
5. **Check.** Call the codegraph `check` tool.

Done when the change uses only tokens and UI blocks, the page keeps to its recipe, and the check lists nothing you added.
