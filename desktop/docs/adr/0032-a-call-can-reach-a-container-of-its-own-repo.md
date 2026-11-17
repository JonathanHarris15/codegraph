# 32. A call can reach a container of its own repo

Date: 2026-11-17

## Status

Accepted. Adds a form to the `to <name>:` tags of ADRs 0008 and 0028.

## Context

A browser app often calls its own server over the network, and the two are
containers of one repo. No import joins them, so the call is tagged with
`to <name>:`, and every such name was read as a call out of the repo: the map
offered the server as a shallow software system, and nothing on the map
joined the two containers. Naming the repo first, `to <this repo>/<server>:`,
was dropped without a word, since a call into its own repo was skipped.

## Decision

- **A call names a container of its own repo as the config names it**, in any
  case: `to api:`. The reader draws it as a wire from the component to that
  container, and it is never a suggestion.
- **It may name the software system first**, as the config's `system` says it,
  so a repo of a system of several repos can be plain about which it means:
  `to billing/api:`.
- **Naming the repo itself first still works.** A repo does not know what it is
  called, so the map, which does, draws `to <this repo>/<container>:` the same
  way.
- **A component naming its own container is a mismatch.** A wire inside a
  container is read from its imports.

## Consequences

A name in a `to` tag that matches one of the repo's own containers can no
longer mean an outside system of the same name. A repo where that happens
renames one of them.

Only a module may make such a call, as with any call out of its container.
