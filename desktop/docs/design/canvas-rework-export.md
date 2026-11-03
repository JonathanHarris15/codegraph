# Canvas rework — what came back

The design for `docs/design/canvas-rework-prompt.md`, built as a Claude Design
system: **Codegraph Canvas**, https://claude.ai/artifact/GqVULPpSmCRNb3C1afyezP

It holds `tokens.json` (two themes), a brand book with four sections, and
fifteen live components. What follows is the inventory the pull was decided
from, then the decisions.

## Decisions taken

1. **Chrome spends no hue.** Buttons, selection, the tool rail, the trail,
   panels and the zoom bar are built from ink and paper only. Every colour left
   on the canvas means a kind or a state. Selection is an ink ring with handles,
   not a blue outline.
2. **Light is the default, dark is complete.** The pages carry real screenshots
   of real light web pages, and those glare on a near-black board. One
   `data-theme` on `<html>` switches it; nothing else changes.
3. **A wire reads as a sentence.** One chip at the midpoint of the wire's own
   curve: the verb in lower case, a hairline, then the words from the code.
   Capitals made the verb read as a label and the sentence stopped working.
4. **Opening a card keeps the world.** The card stays put and turns
   see-through; its neighbours drop to 55% but stay clickable.
5. **The tool rail is part of the frame**, not a floating strip, and on the map
   its drawing group is replaced by one line and a **Start a sketch** button —
   never greyed-out tools.
6. **IBM Plex Sans and Mono**, and **lucide-react** for icons.

## Inventory

### Real — it maps to something that exists

- The five levels, and the kinds at each (`kindsAt` in `sketch-edits.ts`).
- The seven wire kinds (`wireKinds`).
- Card sizes 240 / 280 / 260 × 200, gaps 120 → 360 and 36, four to a row or a
  column (`map-layout.ts`). They became the `layout` tokens unchanged.
- Laying out by kind, left to right (`columnOf`).
- Tunnelling in and out, and passing through a level with one card (ADR 0002).
- The trail, the point picker, the sketch library, the suggestion bar, the
  could-not-place list, the panel for what is picked.
- Every line of copy: *Link a software system to see its map.*, *Reading the
  code…*, *Not set up for codegraph yet*, *No screenshot yet*, *No mockup yet*,
  *no address*, *N things in this repo the map could not place*, *The code calls
  X, which has no card here.*, *Add it*, *Same as…*, *Take it off the sketch*,
  *Sketch from the map*, *Blank sketch*, *Double-click the card to draw what is
  inside it.*
- Everything on a sketch saves as it is drawn; no save button.
- A page drawn as a window with three dots, its address and its screenshot.
- Store chips, from a container's `stores`.
- The dark theme.

### New — somebody can now do or see something they could not

| | Decision |
| --- | --- |
| Light theme, and it is the default | taken |
| A **person** card, drawable beside the software systems | taken — the prompt asked for it |
| A **zoom bar**: out, the scale as a number, in, fit, out a level | taken |
| **Fit** and the scale shown at all; today neither exists | taken |
| An **overview** of the level, bottom right, collapsed by default | taken |
| **Opening in place**: see-through fill, a name lip, neighbours at 55% | taken |
| **Ports** where an outside wire meets an opened card | taken, stopping at the border — see *Not built* |
| Wire **sentence chips** at the midpoint, collapsing past four into a card | taken |
| **Pins**: what reaches a busy card, listed beside it | taken |
| A wire with **no words** shown as a problem on the map | taken |
| **Area** tool: drag a box to zoom to it | taken |
| **Pan** tool, space-drag, and trackpad panning | taken |
| Keys `0`, `+`, `−`, `Enter`, `Tab`, arrows | taken |
| **Mockup** tool in the rail; today it is only in the panel | taken |
| The could-not-place list moves to a count in the top bar | taken |
| **Delete** moves into a ⋯ menu on a sketch row | taken |
| The point picker becomes a button and a list, and reads **Reading from** at the project level | taken |
| The start page keeps the word **page** and gains a star | taken — `kindWords` replaced the kind, which hid that it is a page |
| The trail prints the level word under each name | taken |
| `grid-pitch` 22px → 24px, `radius-store` 26px → 20px | taken |
| Tool names: **Select** becomes **Pick** | taken |

### Scaffolding — swapped for the real thing, never shipped

- The drawn stand-in screenshot in the PageCard preview.
- The hand-drawn glyphs: stand-ins for Lucide on its own 24 × 24 2px grid. The
  app imports the real icons; `KindGlyph/README.md` holds the mapping.
- Invented names: *harris-appraisals*, *nightly-tidy*, *Someone keeping notes*,
  *who it belongs to*, the note about Priya, and the eight rows of the session
  pins list.
- The overview's block positions.

## Where the code and the prompt disagreed

Three places. The code won each time.

1. **The component level has three columns, not four.** `columnOf` puts features
   at 1 and modules at 2; pages, triggers and everything else go to 0. "Then
   where things are kept" is a container-level split.
2. **The start page loses its kind word** — `kindWords` returns `start page`.
   The design keeps `page` and adds a star.
3. **A note is two sizes**: placed 180 × 60, reserved 200 × 90 when the canvas
   fits the level. The placed size became the token; the fit is the bug.

## Not built, and why

- **Wires carried through an opened card to the inner card they really reach.**
  `show-map.ts` aggregates component wires up to container wires, so the inner
  end is not in the data. The port draws the port on the border and stops
  there, which is the design's own fallback. Keeping the real ends is a change
  to `show-map`, and wants its own ticket.
