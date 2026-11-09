# Proposals

A proposal is a sketch being made real on one branch of this repo. It only ever
comes from a sketch: people draw the sketch, and you read it, put its faint
outline over the map, and build until the outline is solid. It works like a
failing test: the `check` tool fails while anything the proposal draws is not
in the code. You work until it passes, and the person watches the map change
as you go.

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
    { "container": "web", "kind": "module", "name": "jobs", "type": "queue", "says": "Holds the work waiting", "at": "", "mockup": "" },
    { "container": "web", "kind": "trigger", "name": "nightly-tidy", "says": "", "at": "", "mockup": "", "gone": true }
  ],
  "wires": [{ "from": "web/page search", "to": "web/feature find-notes", "kind": "asks", "words": "to find notes" }],
  "layout": { "web/page search": [120, 40] }
}
```

- `kind` is one of module, feature, page or trigger, and says which rules the
  card keeps to. `type` is what the team calls it, and is tagged after `as`:
  `// codegraph: module jobs as queue`. A card with a type is not built until
  it is tagged with it.
- `start: true` marks a page as where a person lands: tag it `start page`.
- A container's `kind` is written into the config as it stands.
- `"gone": true` crosses a card or wire out: it is to be taken away, and its
  wires go with it.
- A wire's `kind` is one of `uses`, `asks`, `reads`, `starts`, `keeps`,
  `leads to`, `calls`; see the `tags` instructions for what makes each. A
  wire between two containers stands for any wire between what they hold. A
  `calls` wire to a name that is no container is a call out of the container,
  written `// codegraph: wire to <name>: <words>`.
- `layout` is where the person put each card and each wire's sentence while
  drawing, a wire's by the names it reads as, `from>kind>to`. It means
  nothing to the code: leave it as it is.

### Stores

A proposal can add, change or cross out stores, the kinds of record a database
keeps. Each lists the whole shape the store should have, not just what changes:

```json
"stores": [
  {
    "container": "firestore",
    "path": "people/involvement",
    "says": "What each person is part of",
    "fields": [
      { "name": "roleId", "holds": "text", "needed": true, "pointsAt": "roles" },
      { "name": "since", "holds": "date", "needed": false, "pointsAt": "" }
    ],
    "others": "",
    "migration": "scripts/migrate-involvement.js"
  },
  { "container": "firestore", "path": "roles", "says": "", "fields": null, "others": "", "gone": true }
]
```

- `path` is the store's name, after the store it lives inside for an inner
  store: `people/involvement` is tagged `store involvement in firestore inside people`.
- `fields` is every field it should have. `holds` is said the way the map says
  it: text, number, whole number, yes or no, date, a list of text, a record,
  anything, or choices like `male or female`. `needed` means every record has
  it. `pointsAt` names the store whose record its id belongs to. `null` leaves
  the shape as it is.
- `others` is `""` for a fixed store: a record has only these fields. Otherwise
  it says what any other field holds, and the store is open.
- A store is built when its JSON Schema says exactly this. Write the schema
  the store's tag names with `from`, and have the module that keeps it check
  every write against it. A new store needs a module to keep it; making one is
  part of building the store, so the check does not ask for it to be drawn.
- `migration` is the script that moves the records already kept to the new
  shape. The check asks for one when a change touches those records: a field
  taken away or holding something else, one every record must now have, a
  store closed, or a store whose shape nobody knew. Write it, name it here,
  and tell the person it must be run against the live database. Never run it
  yourself.
- Crossing a store out stops the code using it. Its records stay where they
  are: deleting them is the person's call, not yours.
- Which store a field points at is said by its `pointsAt`, never by a wire.
  A `points at` line drawn on a sketch with no field behind it is a drawing,
  not a change: ask which field it means.

## Making one from a sketch

1. Read the sketch: the `sketch` tool, by name. Open each mockup it names.
2. Be on any branch but the main line: one already in progress, or a new one
   named after the change. A proposal can never start on the main line.
3. Call `propose` with the sketch's name. It compares the sketch with this
   repo's map and writes the proposal: only what is new, and what the
   sketch took away. It says which other software systems the sketch also
   changes. Each needs a proposal of its own, made in its own repo on its
   own branch. A system with no repo yet needs the repo made first.
4. Read what it wrote back to the person in a line or two before building.
5. Commit the proposal and push the branch. Other members only see what has
   reached GitHub, so this is when the outline appears for them.

Work from the sketch as you read it. If someone changes the sketch afterwards,
that does not move what you are building. The map tells people the sketch has
changed; looking at those changes and adding them is another round of work,
started by calling `propose` again with replace set, once a person asks for it.

A sketch holds more than cards to build, and `propose` leaves these out:

- **People and shallow software systems** on the outermost level. A person is
  who uses the software; a shallow system is one somebody else runs. Neither
  has code here, so neither is ever built. A wire to a shallow system is a
  call out of a module, tagged `wire to <name>:`.
- **Notes and annotations.** Sticky notes, text, frames and lines are there
  for you to read. They say why the change is wanted, and sometimes how. They
  are never cards, and nothing you build comes from them alone: if a note asks
  for something the cards do not draw, say so rather than quietly building it.
- **Hubs.** Where a wire meets an open card's border, parts inside wire to a
  hub. You read it as a wire to the card at the far end, which is what the
  proposal makes of it.

## When you think something else makes more sense

What the person drew is what gets built and tagged, until you and they agree
otherwise. You know the code, so say what you see:

- A card drawn as a type of the team's own comes through as a `module`, the
  kind that promises least, because a drawing does not say which rules it
  keeps to. Read what the card is for, choose the kind that fits, and change
  `kind` in the proposal. This needs no asking, but say what you chose.
  A card drawn from one of the app's own templates already says its kind —
  a feature arrives as a feature — so leave those alone.
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
4. Push as parts get built, not only at the end, so other members can watch the
   outline turn solid.
5. Change nothing the proposal does not draw. The check lists anything
   that changed without being drawn. Undo it, or, if the change truly
   needs it, add it to the proposal and tell the person why.
6. When the check says the proposal is built, run the tests. When they
   pass, delete `codegraph-proposal/` in the same commit, so the check
   passes and the proposal never reaches the main line. The sketch it came
   from stays in the project as the record of what was asked for.
7. Call `working-on` with no card when you stop.
