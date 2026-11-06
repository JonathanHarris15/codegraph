# Proposals

A proposal is a change drawn over this repo's map, kept on the branch where
it is built. It works like a failing test. The `check` tool fails while
anything the proposal draws is not in the code. You work until it passes,
and the person watches the map change as you go.

## Where it lives

`codegraph-proposal/proposal.json`, with its mockups as pictures beside it.
A branch has at most one. It never reaches the main line: the change that
finishes building it also deletes the folder.

It lists only what changes. Each card is named the way a person reads it: a
container by its name, `web`, and a component inside one, `web/page search`.

```json
{
  "says": "Let people search their notes",
  "sketch": "Search",
  "base": "<the commit it was drawn on>",
  "containers": [{ "name": "search-index", "kind": "database", "says": "Keeps the words of every note" }],
  "components": [
    { "container": "web", "kind": "page", "name": "search", "says": "Finds a note by its words", "at": "/search", "mockup": "search.png" },
    { "container": "web", "kind": "trigger", "name": "nightly-tidy", "says": "", "at": "", "mockup": "", "gone": true }
  ],
  "wires": [{ "from": "web/page search", "to": "web/feature find-notes", "kind": "asks", "words": "to find notes" }]
}
```

A component with a `"type"` was drawn as a card type the person chose, like a
queue. Tag it with that type: `// codegraph: module jobs as queue`. It is not
built until it is tagged that way. A container's `kind` is written into the
config as it stands.

`"gone": true` crosses a card or wire out: it is to be taken away, and its
wires go with it. A wire between two containers stands for any wire between
what they hold. A `calls` wire to a name that is no container is a call out
of the repo, written `// codegraph: wire to <name>: <words>`. `layout` is
where the person put each card while drawing; leave it as it is.

## Making one from a sketch

1. Read the sketch: the `sketch` tool, by name. Open each mockup it names.
2. Be on a branch of its own, not the main line. If you are not, make one
   named after the change.
3. Call `propose` with the sketch's name. It compares the sketch with this
   repo's map and writes the proposal: only what is new, and what the
   sketch took away. It says which other software systems the sketch also
   changes. Each needs a proposal of its own, made in its own repo on its
   own branch. A system with no repo yet needs the repo made first.
4. Read what it wrote back to the person in a line or two before building.

## When you think something else makes more sense

What the person drew is what gets built and tagged, until you and they agree
otherwise. You know the code, so say what you see:

- A component with a `type` starts as a `module`, because a drawing does not
  say which rules it keeps to. Choose the kind that fits what it does, and
  change `kind` in the proposal. This needs no asking, but say what you chose.
- If a type, a kind that goes against what they plainly meant, a split or a merge
  would serve better, tell the person what and why before building that card.
  If they agree, change the proposal to match. If they do not, build what they
  drew. Never quietly tag something else: the check holds you to the proposal.
- A container of kind `card`, or a component left as a blank `card`, has no type
  yet. Suggest one, and write it in once they agree.

## Building one

1. Call `check`. It lists what is still to build and to take away.
2. Work through it card by card. Before each card, call `working-on` with
   the card's name, `web/page search`, and a few words on what you are
   doing. The person's canvas follows you there.
3. Build it the way the repo's rules say: the right kind, tagged, each new
   import's wire given its words. Call `check` as you go.
4. Change nothing the proposal does not draw. The check lists anything
   that changed without being drawn. Undo it, or, if the change truly
   needs it, add it to the proposal and tell the person why.
5. When the check says the proposal is built, run the tests. When they
   pass, delete `codegraph-proposal/` in the same commit, so the check
   passes and the proposal never reaches the main line. The sketch it came
   from stays in the project as the record of what was asked for.
6. Call `working-on` with no card when you stop.
