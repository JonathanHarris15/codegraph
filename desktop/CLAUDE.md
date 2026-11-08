# codegraph desktop

The codegraph app. The words are in `CONTEXT.md`; its decisions are in
`docs/adr/`, and the plan it is being built to is `docs/plan.md`.

This app's own files still carry the legacy tags and are checked by the
legacy check until it is set up for the new codegraph (plan, checkpoint 5).
The repos it reads use the new tags in ADR 0008.

## Architecture

Three layers, and every source file says in a `codegraph:` tag near its top
which one it belongs to. The code is the architecture.

- **Modules** (`src/modules/`) do the real work behind a small front door.
  Only a module touches a store or an outside connection — the projects file
  on disk, git, the GitHub API, the keystore, the folder picker. The
  `reader` module reads another repo's code and tags into its map, at any
  point in its history (ADRs 0003, 0008). A module
  never calls a feature or the UI. Outside things are handed in by the shell
  (`useFolder`, `useVault`, `useChooser`) so a test can run the module for
  real without Electron.
- **Features** (`src/features/`) are the things a person asks the app to do.
  Each is thin, names the modules it `uses`, and returns what the page shows.
- **UI** (`src/ui/`) is how a person reaches features: the page, components
  used in more than one place, and the design system, which pulls no data.
  The page acts on features through `window.codegraph` and never does the job
  itself.
- **Shell** (`src/main/`, `src/preload/`, `src/ui/main.tsx`) is the wiring:
  the window, the one bridge from the window to the features, and the root
  render. It holds no decisions.

The codegraph MCP (`src/mcp/`) is a second way in: a program of its own,
run under node, that an agent talks to. Each of its tools hands to one
feature, like the bridge does for the window. Everything it tells an agent
lives in the `instructions` module, as Markdown.

The online side sits behind one module, `cloud`, whose `Cloud` type is everything
the app asks of it. `sync` keeps this computer's copy and the online copy in step
(ADR 0021), and every other module still just reads and writes its files, so the
MCP and offline work need nothing new. In tests, and with `CODEGRAPH_CLOUD_FOLDER`,
a folder stands in for Firebase; `docs/firebase.md` says what is left to connect.
With neither, the app runs on one computer as it always did.

Electron runs features in the main process, so every call from the page goes
through `src/main/bridge.ts` — one channel per feature, nothing else in it.
A feature the window needs goes in the bridge's `FEATURES` and the preload's
`NAMES`; the window's types come from the feature itself, and fail to compile
until both lists have it.

## How to work here

1. **Sort the request.** Decide what it is — a feature, a module, a page, a
   component — and put it in the layer it belongs to, not where it is
   quickest to write.
2. **Test first, at that layer's seam.** A module test uses real stores and
   real git in a temp folder, and fakes only what is outside the program
   (GitHub). A feature test calls the feature the way the page would and runs
   the real modules. Fake nothing this repo owns; where the runtime lacks
   something, say so in a `codegraph: fakes <what> because <why>` tag. A page
   test opens the app with `openTheApp` from `tests/yard.ts`, which keeps the
   window out of reach of whoever is using the computer: a stray double-click
   in it strands every test left in that file.
3. **Keep tags true.** A new file gets its tag when it is written. A new name
   other code may use goes on its module's front door; a feature that starts
   using a module adds it to `uses`.
4. **Check before you finish.** `npm run typecheck`, `npm test`, then
   `python ../legacy/codegraph.py . --check`. The work is done when the check
   lists no mismatch you added. The check needs `tree-sitter`,
   `tree-sitter-typescript` and `tree-sitter-javascript` in the Python it runs
   under; without them it reads no TypeScript and reports a cheerful zero.

## Running it

```
npm install
npm run dev     # the app, with the page reloading as you edit
npm run build   # bundles into out/
npm start       # runs what was built
npm run together  # builds, then opens two windows, as two members, with no Firebase
```
