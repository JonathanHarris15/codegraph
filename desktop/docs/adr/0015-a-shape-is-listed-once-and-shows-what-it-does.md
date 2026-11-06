# 15. A shape is listed once, and shows what it does

Date: 2026-11-06

## Status

Accepted

## Context

The annotation library grew by copying a diagram tool's stencil list:
Standard, Flowchart, Containers, Shapes. The groups were families a shape
could be sorted into, not promises about what a shape does, so the same
outline turned up in several of them under several names.

Five shapes were listed twice. `box` and `frame` were the same dashed box.
`process` and `rect` were the same plain box. `diamond` and `decision` were
the same diamond, `connector` and `circle` the same circle, `preparation` and
`hexagon` the same hexagon give or take a few units. A person looking at the
library saw three identical squares in one row and could not tell which was
which, because there was nothing to tell.

The shapes that did differ did not say so. A list and a code block drew the
same empty square as a plain box; the difference only appeared once there
were words in them, and vanished again the moment someone double-clicked to
type, because the box that opened to type in was the same box every time.

A swimlane and a column were worse: a dashed box with the word "Swimlane" in
the corner, no different from a frame except for what it was called.

## Decision

**A shape appears in the library once.** A shape that was listed twice is
dropped and its old name becomes a word you can search by, so the one that
survives is still found by either name. An annotation already drawn under a
dropped name still draws what it always drew: `shapeOf` maps the old name to
the survivor, and `annotationWords` tells an agent the same thing it told it
before.

**A group is a promise about what its shapes do, not a family they belong
to.** There are four, and each says its promise under its heading:

- **Notes** carry words of their own.
- **Lines** join two things and hold on at both ends.
- **Frames** are drawn round what they hold.
- **Shapes** are an outline you put a label in.

The flowchart shapes are shapes; their flowchart names find them. "Frames"
rather than "Containers", because a container in codegraph is a part of a
software system that runs on its own, and the annotation layer must not take
that word.

**A shape's face says what it does, in the library and on the board, at rest
and while someone is typing on it.** A shape carries, beside its outline:

- `marks` — strokes that are part of the symbol, drawn everywhere.
- `hint` — strokes the library's button draws and the board does not: the
  ruled lines of a note, the bullets of a list. On the board the words do
  that job, so drawing them there would only sit behind the words.
- `band` — a filled strip that is part of the symbol and stretches with it.
- `strip` — a strip that stays the same thickness at any size: a code
  block's header, a swimlane's side, a column's head.
- `title` — where a frame's name sits: a tab at its corner, or its strip.

`d` is now the edge alone. Anything inside a shape is `marks` or `band`, so
`textAreaOf` and `meetOutline` are given the real outline and nothing else.

A swimlane is a frame with a strip down its left and its name turned to run
along it; a column is a frame with a strip across its top. That is the
difference between them and a plain frame, and it is visible.

## Consequences

Someone scanning the library can tell any two buttons apart, and two buttons
that look alike are the same shape — a test over `SHAPE_GROUPS` holds that
true, so the next shape added cannot quietly repeat one.

Typing on a shape looks like reading it: a code block stays mono, a note
stays hand-written, a frame's name is typed on its tab or in its strip
instead of over everything the frame holds.

The library is shorter by five shapes. Nobody loses a shape they had: the
dropped names still find and still draw the shape they always meant.

A strip is measured in pixels while the rest of a shape is measured in
hundredths of its box, so a shape with a strip works out where its words go
in pixels rather than shares. That is two ways of saying the same thing, kept
apart in `wordsBoxOf`.
