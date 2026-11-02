# What a person sets off in a page is a feature

A page may import a module to show what it offers: that is an informed-by
wire, and it is fine. The check read nothing more than that. It never looked
inside a page to ask *when* the module was called, so a page whose Save button
checked the form, called three modules in order and wrote the result passed
clean. On a real repo many pages did exactly that: the feature was there, but
written inside the page, with no name, no system and no test of its own.

We now read inside every page, component and the shell for the code that runs
when a person acts: a function handed to an element as `onClick={...}` or
`on_click=`, one handed to `addEventListener` or as `command=`, one named
`handleX`, `onX`, `handle_x` or `on_x`, and the file's own functions those
call. If that code uses a name from a module that keeps a store or reaches an
outside connection, the page is doing a feature's work, and that is a
mismatch: acting lands on a feature, never straight on a module. One finding
per handler and module, and the page's wire to that module is drawn broken.

## Considered options

- **Flag any page that imports a module.** Simple, but most such imports only
  show something, and the rule that a page may be informed by a module is
  right.
- **Flag any call a handler makes into any module.** Catches more, but a
  handler that formats a date through a module that keeps nothing is not a
  feature. Limiting it to modules that keep a store or reach outside keeps
  the list to work that changes or fetches something.
- **Guess from names** (`save`, `create`, `delete`). Reads well and fails on
  every repo that names things differently. When the code runs is a fact the
  parser can see; what a function's name means is not.

## Consequences

A refresh or search button that calls a module is flagged too. That is
intended: a person asked the app to do something, which is what a feature is,
even when the feature is small.

The check cannot see a job done inline with no module call (parsing a file in
the page), or a call hidden behind a hook or a prop passed down. Setup and
fix read the inside of each page for those by judgment, and the skills say so.
