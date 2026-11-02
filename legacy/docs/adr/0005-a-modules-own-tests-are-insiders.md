# A module's own tests are insiders

A module test used to be held to the module's front door like any other
caller. On the first real repo codegraph was set up in, 47 of 114 mismatches
were a test taking a name from its own module that was not on the door, and
not one piece of production code reached past a door anywhere. Each finding
forced one of two bad fixes: widen the door until it lists nearly everything,
so it stops saying what is really offered, or test through a wrapper, which
turns a sharp test (`signedArea`) into a vague one (`mergeParcels`) whose
failure no longer names its cause.

We let a test tagged `test module X` use any name in X, the same as X's own
files. A test reaching into a *different* module's insides is still a
mismatch, and so is a feature or UI test reaching past any door: that is the
case that shows real coupling, and there was exactly one of it in 209 files.

## Considered options

- **Keep tests at the door.** Honest in theory, but in practice it pushes
  toward worse doors or worse tests, and buries the one real finding among
  forty-six that are not.
- **Report insider reach as "cannot tell".** Keeps some pressure, but adds
  dozens of lines to a list people need to read, about something that is not
  a problem.

## Consequences

The door now means one thing: what other code may use. The question setup
asks of each name is "would I mind another module using this?", not "does a
test use this?". Whether a test should go through the door is now a question
about the test, not the architecture: testing at real seams is still the
habit, but codegraph no longer forces it.
