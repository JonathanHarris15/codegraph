# Canvas rework — Claude Design prompt

No ticket (this project keeps its plan in `docs/plan.md`). 2026-11-03.
Asked for by Jonathan after trying checkpoints 1–3 in the app.

---

## 0. What to read, and where it is

**Design system.** There is no codegraph design system in Claude Design yet.
The app's only one is `desktop/src/ui/design-system/theme.css` (tokens on
`:root`, then classes) and `desktop/src/ui/design-system/kit.tsx` (Button,
Card, Field, Badge, Sheet). Treat them as what exists today, not as the
standard to meet: part of this job is to replace them with something better,
and to say so where you do.

**Repo.** Use *Link local code* on `C:\Users\jono1\Professional Projects\Codegraph`,
branch `desktop-app` (not yet on GitHub; `JonathanHarris15/codegraph` on
GitHub is behind). Everything is under `desktop/`. Read these and no others:

| Question | File |
| --- | --- |
| What the words mean: project, person, software system, shallow software system, container, component (module, feature, page, trigger), code, card, wire, tunnelling, page map, sketch, mockup, screenshot | `desktop/CONTEXT.md` — all of it; it is short |
| The screen being reworked | `desktop/src/ui/pages/canvas.tsx` |
| How the canvas draws, pans, zooms and tunnels today | `desktop/src/ui/components/map-canvas.tsx` |
| Card sizes, how cards are laid out by kind, how wires are routed | `desktop/src/ui/components/map-layout.ts` |
| Drawing on a sketch: tools, the side panel, the closed lists of kinds | `desktop/src/ui/components/sketch-editor.tsx`, `sketch-edits.ts` (`kindsAt`, `wireKinds`) |
| The sketch library, the branch/commit picker, suggested systems | `desktop/src/ui/components/sketch-library.tsx`, `point-picker.tsx`, `suggestion-bar.tsx` |
| What a card of the map carries | `desktop/src/features/show-map.ts` (the `Card` type) |
| What a sketch carries | `desktop/src/modules/sketches/schema.ts` |
| Why the map works the way it does | `desktop/docs/adr/0002`, `0003`, `0007` |

The projects page (`pages/projects.tsx`) is out of scope for this pass.

## 1. The job

Someone opens one project to understand its software, or to sketch how it
should change and hand that to their coding agent. The canvas shows the
project at the C4 levels, read from the code: software systems, their
containers, the components in those, and the code. They zoom between levels
to follow how things connect, switch which branch or commit they are looking
at, and on a sketch they draw cards and wires of their own. Today it is hard
because it looks and behaves like a prototype. Panning is awkward. Zooming
into a card throws away everything around it, so you lose how the outside
world connects to what you are looking at. Wires say only a bare verb. There
are no proper ways to get around: no zoom controls, no way to fit the view,
no overview. The drawing tools float in a small strip and can only make some
of the cards a C4 diagram needs. It should feel like a professional
whiteboard tool, Lucidspark being the person's own reference.

## 2. What is real — use these, do not invent

These are the real values from the product; use them exactly. If you need
something not on this list, look for it in the code first, and if it is not
there either, mark what you used as a suggestion. **This section is a digest
of the code, not a replacement for it. Where the two disagree, the code
wins — and say where you found a difference.**

**Two modes on one canvas.** The *map* is read from code and cannot be
drawn on. A *sketch* is drawn by a person and kept with the project. Both
use the same cards, wires and zooming. On the map, the toolbar's drawing
tools do not apply; a person starts a sketch to draw.

**The levels, outermost first:** project › software system › container ›
component › code. A card at one level holds the next level inside it.

**Cards, and every kind each level has** (from `kindsAt`, plus Person, which
is new and must be added):

- Beside software systems: **person** (new; drawn only, never read from code)
- Software system level: `software system`, `shallow software system` (run
  by someone else, no repo here; drawn dashed today)
- Container level: `web app`, `browser app`, `server`, `desktop app`,
  `mobile app`, `database`, `files on disk`, `function`, `command-line tool`
- Component level: `page`, `feature`, `module`, `trigger` (a trigger is a
  `schedule`, an `event` or a `command`). One page is the **start page**.
- Code level: `file`, listing the names declared in it.

A **page** card shows a picture: on the map, its **screenshot** (the tests
take it; may be missing: "No screenshot yet"); on a sketch, its **mockup**
(may be missing). Pages have an address, like `/notes/:noteId`; some have
none.

**Wires** are one-way. Kinds, in full: `uses`, `acts on`, `shows`,
`starts`, `keeps`, `leads to`, `calls`. Each wire also has words saying what
it is for, written in the code. A wire must **read as a sentence**: who acts,
how, on what, and what for. Real ones from indie-stack:

- feature `write-note` → module `notes`, uses: "saves the note"
- page `notes` → module `session`, shows: "makes sure someone is logged in"
- page `join` → feature `sign-up`, acts on: "signs a new person up"
- module `users` → container `db`, keeps: "keeps passwords"
- module `notes` → shallow system `mailer`, calls: "tells the owner"
- page `home` → page `login`, leads to: no words (leads-to wires have none)

Some wires have no words yet; on the map those are a problem to show, not
hide.

**A real project to draw: indie-stack** (project short name `indie-stack`).
One software system `indie-stack`. Containers: `web` (web app, "Where people
sign up, log in and keep their notes") and `db` (database, "SQLite, through
Prisma: people, their passwords and their notes", keeps `notes`, `users`,
`passwords`). Inside `web`, 21 components:

- pages: `home` (start page, `/`), `join` (`/join`), `login` (`/login`),
  `logout` (`/logout`), `notes` (`/notes`), `notes-new` (`/notes/new`),
  `note` (`/notes/:noteId`), `no-note-picked` (no address)
- features: `delete-note`, `log-in`, `log-out`, `sign-up`, `write-note`
- modules: `checks`, `current-user`, `db`, `notes`, `users`, `layout`,
  `session`

32 wires join them, plus 12 leads-to wires between pages. The busiest card
is module `session`, with 8 wires into it. That density is the case the
design must survive.

**A real sketch:** "Search" — project level, software system `notes` with a
wire to shallow software system `search`, calls, "finds notes by their
words", and a note: "Which search service?".

**Around the canvas, real controls that exist today:**

- A trail of where you are, e.g. `indie-stack › indie-stack › web`; each step
  goes back to it.
- Which point in history a software system is read at: "Live folder, with
  what is not committed", a branch (`main`, `codegraph-setup`), or a commit
  (`0ca4a7d  Set up codegraph`). One per software system.
- The sketch library: "Sketch from the map", "Blank sketch", each sketch
  with its name, where it came from ("A snapshot of the map, 2026-11-02" or
  blank) and when it changed.
- Suggested shallow systems: "The code calls mailer, which has no card
  here." with *Add it* and *Same as…*.
- Things the map could not place: "1 thing in this repo the map could not
  place", expanding to lines like "loose.ts is not in any container's
  folders".
- On a sketch, a panel for the picked card (name, kind, what it is for, a
  page's address, *Add a mockup*), wire (kind, words) or note (text), and
  *Take it off the sketch*.

**States:** a project with no software systems ("Link a software system to
see its map."); a repo not set up ("Not set up for codegraph yet"); reading
("Reading the code…"); an empty level of a sketch; a level of one card; the
dense `web` level above.

**Behaviour that is settled:**

- Zooming into a card **opens it in place**: the card stays where it is,
  turns see-through, and its insides are drawn within it, while the cards
  around it and their wires *into* it stay in view. Zooming out closes it
  again. No level replaces the screen. (`CONTEXT.md`, Tunnelling.)
- A level with only one card is passed through on the map (ADR 0002).
- Everything on a sketch saves as it is drawn; there is no save button.
- Cards on the map are laid out by kind, left to right: pages and triggers,
  then features, then modules, then where things are kept.

## 3. Compose from these

Today's pieces, from `kit.tsx` and `theme.css`: `ds-button` (with `--loud`
and `--bare`), `ds-card`, `ds-input`, `ds-field`, `ds-badge`, `ds-sheet`, and
the canvas classes `map-card`, `map-frame` (a page drawn as a window with its
picture), `map-note`, `map-wire`. They are rough. Use them where they fit,
and **where none fit, say so and design the new thing — do not force it into
an existing one.** A left tool bar, zoom controls, an overview and an
opened-in-place card are all new primitives, and that is expected.

## 4. What is open

- The whole look: type, colour, spacing, card styling for every kind above,
  so a level reads at a glance and kinds are told apart without reading.
- The left tool bar: what is in it, in what order, how the card kinds are
  offered (there are many), and what it shows on the map, where drawing is
  off.
- How a wire reads as a sentence on the canvas, and where it sits, so the
  words never press against a card and a busy card like `session` stays
  readable. Propose the sentence form itself.
- How an opened card looks: how see-through, how its insides sit within it,
  how outside wires meet it — at its edge, or carried through to the inner
  card they really reach.
- Navigation: zoom in and out, fit to the view, back up a level, the trail,
  an overview of where you are. How panning works with a mouse, a trackpad
  and the keyboard.
- Where the branch/commit picker, the sketch library, the suggestions and
  the could-not-place list live.
- Light or dark, or both. The app is dark today; that is not a requirement.

## 5. Constraints

- Tokens only, no raw colour in components; define the tokens.
- There is no icon set in the project yet. Pick one available as an npm
  package (the app is Electron + React, bundled with Vite) and name it.
- Desktop only: an Electron window, smallest 720 × 520, usually around
  1400 × 860. No phone width.
- Pages show real screenshots, which are light web pages; they must sit well
  on whatever background you choose.

## 6. What to send back

1. The export prompt.
2. A note on anything you placeholdered or invented.
3. Anywhere the code and section 2 disagreed, and which one you followed.
