# The reader is written again, in TypeScript

The part of codegraph that reads code into a map is written afresh in
TypeScript inside the app, using the Python reader in `legacy/` as a guide to
the hard cases it learned rather than calling it.

Calling the Python reader would put a map on screen sooner. But it reads the
old levels, not C4's, so it would have to be bent to fit; and every person
using the app would need Python installed beside it. One install and a reader
built for the new levels are worth the slower start.
