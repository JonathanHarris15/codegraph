# indie-stack

A small notes app for trying codegraph on: sign up, log in, write a note,
delete it. Remix, Prisma and SQLite, from Remix's archived
[Indie Stack](https://github.com/remix-run/indie-stack) (MIT, see LICENSE.md),
with its deploy setup taken out and the app set up for codegraph.

## How it is built

The codegraph way, as `CLAUDE.md` says:

- **modules** in `app/`: `db` (the Prisma client), `users` and `notes` (each
  owns its tables), `session` (the signed-in cookie), `checks` (form checks)
- **features** in `app/features/`: `sign-up`, `log-in` and `log-out` in
  accounts; `write-note` and `delete-note` in notes
- **pages** in `app/routes/`, each tagged with its address; a page's form hands
  its work to a feature. `root.tsx` and the two entry files are the shell.
- **tests**: `app/checks.test.ts` (Vitest) and `cypress/e2e/smoke.cy.ts`,
  which walks every page and takes a picture of each for the map.

`python ../../codegraph.py . --check` should say `0 mismatches`.

## Run it

Node 18 or newer.

```
npm install
copy .env.example .env      # cp on macOS
npm run setup               # the database, with a seeded user
npm run dev                 # http://localhost:3000
```

The seeded user is `rachel@remix.run`, password `racheliscool`.

## Test it

```
npm test -- --run           # unit tests
npm run typecheck
npm run test:e2e:run        # builds, starts the app, runs Cypress, stops it
```
