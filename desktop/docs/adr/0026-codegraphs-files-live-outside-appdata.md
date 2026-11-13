# 26. Codegraph's files live outside AppData

Date: 2026-11-13

## Status

Accepted.

## Context

The app and the MCP share one folder of files: projects, sketches, who is
signed in, and the agent's cursor (ADR 0025). Both found it where Electron
keeps an app's files, under AppData on Windows.

The Claude app on Windows is a packaged app. Windows gives a packaged app, and
every program it starts, a private copy of AppData: what it writes there lands
in the copy, and what it reads comes from the copy first. Claude Code runs
inside the Claude app, and starts the MCP, so the MCP read a copy of the
projects file days older than the app's. It did not find a project the person
owned, and refused to draw in it. Had it drawn, the app would not have seen
the drawing, nor the agent's cursor.

## Decision

- Codegraph's own files live in **`.codegraph` in the home folder**, on every
  computer, for the app and the MCP alike. Windows does not copy that folder
  for a packaged app.
- The window's own files (Chromium's caches and settings) stay where Electron
  keeps them, under `codegraph-desktop`.
- The first time the app opens with nothing in the new folder, it **copies**
  codegraph's files over from the old one and leaves the old ones where they
  were. What a window is looking at is not copied.
- `CODEGRAPH_HOME` still names another folder, and a `--user-data-dir` on the
  command line still keeps everything together there, as tests do.

## Consequences

- An agent run from the Claude app reads and writes the same files as the app.
- The MCP finds nothing until the app has opened once after the update.
- An older codegraph still installed keeps reading the old folder, which stops
  changing, so the two drift apart until it is updated.
- Stale copies left in the Claude app's private AppData are no longer read by
  anything, and can be deleted by hand.
