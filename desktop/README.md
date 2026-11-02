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
Packaging it into something you double-click is not set up yet.

## How it is put together

Three layers — modules, features, UI — with a `codegraph:` tag on every file
saying which one it belongs to. `CLAUDE.md` has the rules; `CONTEXT.md` has
the words.
