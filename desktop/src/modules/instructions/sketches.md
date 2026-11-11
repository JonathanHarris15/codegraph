# Sketches

A sketch is a drawing of how a project's software could be: people, software
systems, the containers inside them and the parts inside those, joined by
wires. People draw them in the app; you can draw one too, with the `draw`
tool, written as a Mermaid flowchart with a few codegraph tags. Drawing again
with the same name replaces the sketch, and keeps where people moved its
cards.

Read a sketch back with `sketch`. Make a proposal from one with `propose`.

## How to write one

```mermaid
flowchart LR
  %% note: Outfits follow the weather
  shopper(["Shopper"]):::person
  weather["Weather service"]:::shallow-software-system
  wardrobe["Wardrobe"]:::software-system
  %% says wardrobe: Suggests what to wear
  shopper -->|uses: to get outfit ideas| app
  subgraph wardrobe
    app["Phone app"]:::mobile-app
    api["Wardrobe API"]:::server
    db[("Clothes")]:::database
    app -->|calls: to fetch suggestions| api
    api -->|keeps: keeps the clothes each person owns| db
    subgraph api
      suggest["suggest-outfit"]:::feature
      clothes["clothes"]:::module
      suggest -->|uses: to look up what fits| clothes
    end
  end
  api -->|calls: to read the forecast| weather
```

- **A card** is a node: `api["Wardrobe API"]:::server`. The id (`api`) is how
  the rest of the flowchart points at it; the words in brackets are its name;
  any bracket shape will do.
- **Its kind** is the class after `:::`, with dashes for spaces. You can also
  write `class api,web server` on a line of its own. With no class, a card is
  the first kind its level offers.
- **A subgraph is the inside of a card**: `subgraph wardrobe` ... `end` holds
  what is inside the card whose id is `wardrobe`. Give the card its name and
  kind as a node first, or name it on the subgraph: `subgraph wardrobe ["Wardrobe"]`
  with `class wardrobe software-system`.
- **A wire** is an edge, and its words start with its kind:
  `app -->|calls: to fetch suggestions| api`. The kinds are `uses`, `asks`,
  `reads`, `starts`, `keeps`, `leads to`, `calls` and `points at`. A wire with
  no words is a plain `uses`. Words that start with "to" read as what it is for.
- **A wire into a card** from beside it can reach one level in: `shopper --> app`
  draws the wire from the shopper to the wardrobe, and inside the wardrobe on
  to the phone app. To reach deeper, wire to the card the part is in.
- **Notes**: `%% note: words` puts a sticky note on the level it is written
  on. `%% says api: words` says what a card is for. `%% at search: /search`
  gives a page its address.
- Other comments, `classDef`, `style`, `linkStyle` and `direction` lines are
  passed over, so the flowchart can be styled to show elsewhere too.

## The kinds on each level

- **Top level**: `person`, `software-system`, `shallow-software-system` (one
  someone else runs, with no repo here). A person has nothing inside.
- **Inside a software system**, containers: `web-app`, `browser-app`,
  `server`, `desktop-app`, `mobile-app`, `database`, `files-on-disk`,
  `function`, `command-line-tool`, or a plain `card`.
- **Inside a container**, components: `page`, `feature`, `module`, `trigger`,
  or a plain `card`.
- **Inside a database** or files on disk: `store`. Inside a store: `inner-store`.
- **Inside a component**: `file`.
- At the container and component levels, any card type the person has saved
  in the app is a kind too, drawn in its look.

Anything else is turned down. When a line is wrong, nothing is drawn, and
you are told every line that needs fixing.

## What happens next

The sketch is written on this computer at once, with its cards laid out by the
canvas. If the project is online, the app sends the sketch up the next time it
is open, and anyone on the project sees it then.
