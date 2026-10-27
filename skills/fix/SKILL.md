---
name: fix
description: Fix one codegraph mismatch, test-first, as its own small change. Use when the codegraph check is red, when asked to clean up or tighten the architecture, or after codegraph setup.
---

# Codegraph fix

Moves the codebase one step closer to its tags. One mismatch per run, unless the person asked for more: a small change they can review beats a sweeping one.

The check is the `mcp__codegraph__check` tool. Without it, run `python CG . --check`, where `CG` is `codegraph.py` two folders above this skill's base directory.

## Steps

1. **Pick.** Run the check. Take the mismatch the person named, else the worst by this order: layers broken, front doors crossed, stores and schemas, triggers and pages, test fakes.

2. **Decide whether the tag or the code is wrong.** A tag is wrong when it misstates what the code is *for*: a file tagged module that is really a feature, a page with no `at` its framework cannot give. Fix the tag and go to step 5. Otherwise the code is wrong, which is most of the time. Widening a front door or adding to `uses` only to go green counts as a code fix too: do it only when the crossing is one the design should allow, and say why.

3. **Pin the behaviour.** Before moving code, a test at the right seam must cover the behaviour that moves, and pass. Write it if it is missing: a module test from inside the module, a feature test through its trigger, a UI test walking the page. Where the fix adds behaviour (a schema the module now checks data against), write the test first and watch it fail.

4. **Fix the code.** The usual cures:
   - *module calls a feature or the UI*: the module hands back a result, and the feature or page does the calling.
   - *feature calls a feature*: the shared work moves into a module both use.
   - *feature, page or component reaches a store or an outside connection*: that work moves into the module that owns the store or the connection, behind its front door.
   - *name off a front door*: the caller uses what the door offers, or the module grows a door name that says what the caller needs. Never reach inside.
   - *store with no schema*: add one the owning module checks its data against, and tag it. Where the fields are not the code's to declare — an outside source decides them — give the owning module a shape helper instead: a file tagged `shape of <store>` that prints the shape as JSON when it is run (docs/adr/0006).
   - *another module writes a store*: it asks the owner, through the owner's front door.
   - *feature with no trigger*: a page acts on it, or it gains its schedule, event or command, or it was never a feature.
   - *page unreachable, or no UI test walks it*: link to it from a page that leads there, or add the UI test.
   - *test fakes the repo's own code*: test through the real code, faking only what is outside the program. Only where the test runtime cannot run that code at all (jsdom has no canvas) keep the fake and say so: `codegraph: fakes <what> because <why>`.

   Keep tags true as code moves: a moved file keeps or changes its tag on purpose.

5. **Prove it.** Done when the check no longer lists this mismatch, lists none you added, and the repo's tests pass.

6. **Commit** this one fix on a branch, the mismatch it fixes in the message. Report what changed, what the check shows now, and the next mismatch worth fixing.
