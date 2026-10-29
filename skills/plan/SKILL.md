---
name: plan
description: Turn what a person wants built into a codegraph plan they can see on the map before any code is written, check a plan a person sketched on the map, or build a plan that is already waiting. Use when the person rambles about something new, hands over a ticket or an epic, asks what a change would look like, says "/codegraph:plan", or presses Send or Build on the map.
---

# Codegraph plan

A plan is a change waiting in `plans/<name>.json` at the repo root. The live map draws what the code has not got yet as dashed cards and wires, and red where it breaks a rule. A plan is a request, never a declaration: the tags stay the only word on what the code is, and a plan is deleted once it is built (codegraph's ADR 0008; CONTEXT.md, Plans).

`/codegraph:plan review <name>` checks one a person sketched on the map. `/codegraph:plan build <name>` builds one. Anything else asks you to write one.

## Writing a plan

1. **Read the map** with `mcp__codegraph__map`, and the repo's `CONTEXT.md`. Sort what was asked into cards — modules, features, pages, components, stores, new or changed — and the wires between them. Reuse what is there: a plan card with a real card's id asks for more on that card (a door name, a field, a route), never a second one.
2. **Ask only what you cannot infer.** If the person rambled, take the shape from what they said and what the map already holds; ask when two readings would build different cards.
3. **Write the plan.** One file per change, named for it (`plans/remind-before-serving.json`):

   ```json
   {
     "ask": "What the person asked for, in their words, cut short.",
     "cards": [
       {"kind": "feature", "name": "remind", "system": "calendar", "program": "server",
        "about": "Emails everyone serving next week.", "roles": ["elder"],
        "takes": "a week", "gives": "who was reminded",
        "triggers": ["schedule every Monday at 09:00"]},
       {"kind": "module", "name": "mail", "program": "server", "about": "Sends email.",
        "door": [{"name": "send", "takes": "an address and a message", "gives": "sent or why not"}]},
       {"kind": "store", "name": "reminders", "owner": "reminders", "fields": {"member": "text", "sent": "date"}},
       {"kind": "page", "name": "rota", "route": "/rota", "program": "browser", "about": "Who serves when.",
        "design": "plans/remind-before-serving/rota.png"}
     ],
     "wires": [
       {"from": "feature:remind", "kind": "uses", "to": "module:mail"},
       {"from": "page:rota", "kind": "acts on", "to": "feature:remind"}
     ]
   }
   ```

   - A card's id is `kind:name`. A wire runs from the card that reaches to the card it reaches, in CONTEXT.md's words: `uses`, `informed by`, `acts on`, `contains`, `writes`, `reads`, `leads to`, and `imports` for a module using another.
   - `about` says what the card is for in a few plain lines, in the person's words where they gave them.
   - `program`, `roles`, `takes` and `gives` go in wherever you know them. The map shows them; codegraph cannot check them against the code yet.
   - A feature's `triggers` are `schedule <when>`, `event <name>` or `command <name>`. A person starts a feature through an `acts on` wire from a page instead.
   - A store names its owning module; only the owner writes it.
   - A page's `design` is a screen or a page of HTML kept in `plans/<name>/`. A person drops these on the map; you rarely write one yourself.
4. **Correct it.** Read the map again: each plan lists its `problems`. Fix every one. Where a problem comes from what the person asked for (a page that saves straight to a store), correct the plan to the right shape and remember to tell them why.
5. **Show it.** Open the map with `mcp__codegraph__open`. Say in a few lines what the plan adds and changes, and anything you corrected. Build nothing until the person approves: they press **Build it**, or say so.

## Checking a sketched plan

A person drew this one on the map's pages view: new pages, which page leads to which, and designs dropped on pages. It says `"drawn": true`. They said where pages go and what they look like, not how the code does it.

1. **Read** the plan, its `ask`, every design in `plans/<name>/` (look at the pictures; read the HTML), and the map.
2. **Fill in what a sketch leaves out.** A page whose design has a form or a button that does something needs the feature it acts on, and the modules that feature uses: add those cards and wires, named in the repo's words. A page with no route gets one in the style of the others. A page nothing leads to needs a way in; say so rather than guess where.
3. **Correct it** as in step 4 above, and keep what the person drew: change their pages and links only where they break a rule, and say why.
4. **Show it** as in step 5 above, saying what you added and what you changed.

## Building a plan

1. **Read** `plans/<name>.json` and the plan's entry in the map: what is left, and any problems.
2. **Build it the repo's way**, on a branch: test first at each layer's seam, a tag on every new file, front doors and `uses` kept true, as the codegraph section of CLAUDE.md says.
   - A page with a `design` is built to look like it. Where the repo has a design system, build from its pieces rather than copying the design's styles; the `design-pull` skill does this well where it is installed.
   - `leads to` wires say where a person can go, not where the link sits. Put each link where it reads naturally on the page: a nav bar for places every page reaches (that is the shell), a button or a row link for the rest.
   - Once a page matches its design, take `design` off its card: codegraph cannot tell when a page looks like a picture, so that is your call, and the plan stays unbuilt until you make it.
3. **Hold it against the plan.** Read the map again. Anything still left is work to finish. If you built something differently on purpose because it was better, change the plan file to match what you built, and say what and why. A plan must end fully built.
4. **Delete the plan.** Once nothing is left, the check says `plan <name> is built: delete it`. Delete the file, and its designs in `plans/<name>/`, in the same change. Never keep a built plan for the record: git and the ticket keep what was asked for. Where a design is worth keeping, it belongs with the design system, not in `plans/`.
5. **Finish.** The check lists no mismatch you added, the tests pass, and the work is committed. Report what got built and where it differs from what was asked.
