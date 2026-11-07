# codegraph desktop

The app you open. One screen: your projects as a grid of cards.

A **project** is a piece of work — "Mosaic Manager", not "the api repo" — and
it holds one or more **systems**. A software system is a repo on this computer that
git tracks and that codegraph is turned on inside. Each card says, for each
system:

- **codegraph on**, with how many of its files carry tags — or **needs setup**,
  and hovering says what is missing.
- **level with GitHub**, **3 behind GitHub**, **2 to push**, or **diverged** —
  so you can see at a glance where a copy has fallen behind the cloud.
- **uncommitted changes**, where there are any.

**New project** makes an empty one. **Link a repo** points it at a folder
already on this computer: the app reads it and remembers where it is. It never
writes to your repo and never moves code — turning codegraph on inside a repo
is still `/codegraph:setup` in Claude Code.

**Refresh** fetches from GitHub first, then recounts. Without it the app says
what git last knew.

Sign in with a GitHub token and the app also shows the repos you are part of
that are set up for codegraph but are **not on this computer**. Cloning one
from here is not built yet: clone it yourself, then link it.

## Running it

```
npm install
npm run dev
```

`npm run build` bundles it into `out/`; `npm start` runs what was built.

## Making the installers

`npm run package` builds the app and writes installers into `release/`: a
`.dmg` for each kind of Mac, a setup `.exe` for Windows and an `.AppImage` for
Linux. The icon is drawn in `build/icon.svg`; `build/icon.png` is that drawing
at 1024 pixels, which the builder turns into each system's icon.

The app is kept as plain files inside the install, not packed into one
archive, because the codegraph MCP runs under `node` from the installed
`out/main/mcp.js`, and `node` cannot read inside the archive. The installers
are not signed, so Mac and Windows each warn the first time; the release
notes say how to get past it.

## How it is put together

Three layers — modules, features, UI — with a `codegraph:` tag on every file
saying which one it belongs to. `CLAUDE.md` has the rules; `CONTEXT.md` has
the words.
